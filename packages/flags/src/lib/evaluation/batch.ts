import type { Flag } from "#lib/definition/index.ts"
import type { IdentitySource, Subject } from "#lib/identity/index.ts"
import { pickDecision } from "#lib/provider/index.ts"
import {
  createEvaluationSignal,
  createSharedSignal,
  raceWithSignal,
  type SharedSignal,
} from "#lib/shared/signals.ts"
import { normalizeError } from "#lib/shared/utils.ts"
import { type Decide, evaluate, type EvaluationDetails, type Evaluator, timeoutOf } from "./engine"

/**
 * One provider request shared by every evaluation in a batch that needed provider work in the same
 * tick. Each flag key joins once, so two flags with one key share one decision. The round closes
 * when its timer fires, so evaluations that resolve from the store never delay or join it. Each
 * evaluation joins `shared` with its provider signal, so the request stops only when every
 * evaluation has left, and not when the batch returns: an evaluation can lead a coalesced call that
 * an evaluation outside the batch still waits for. Each key also has its own shared signal, so a
 * `decideOne` call stops when the evaluations that wait for that key have left.
 */
type FlushRound<TIdentity extends Subject> = {
  decisions: Map<string, RoundDecision>
  identity: TIdentity
  shared: SharedSignal
}

type RoundDecision = {
  flag: Flag
  pending: PromiseWithResolvers<unknown>
  shared: SharedSignal
}

function settleDecision(decision: RoundDecision, settle: () => unknown): void {
  try {
    decision.pending.resolve(settle())
  } catch (error) {
    decision.pending.reject(normalizeError(error))
  }
}

function rejectRound<TIdentity extends Subject>(
  round: FlushRound<TIdentity>,
  error: unknown
): void {
  for (const decision of round.decisions.values()) {
    decision.pending.reject(normalizeError(error))
  }
}

/**
 * How a batch reads: the caller's signal, and whether to skip stored decisions and calls in flight.
 */
export type BatchRead = { fresh: boolean; signal: AbortSignal | undefined }

/**
 * Evaluates several flags with one identity resolution. Each flag keeps its own hooks, validation,
 * timeout, fallback, and details. The results keep the order of `flags`.
 */
export async function evaluateMany<TIdentity extends Subject, const TFlags extends readonly Flag[]>(
  evaluator: Evaluator<TIdentity>,
  flags: TFlags,
  identify: IdentitySource<TIdentity>,
  read: BatchRead
): Promise<{ -readonly [K in keyof TFlags]: EvaluationDetails<TFlags[K]> }> {
  type Results = { -readonly [K in keyof TFlags]: EvaluationDetails<TFlags[K]> }
  if (flags.length === 0) {
    return [] as unknown as Results
  }

  const { provider } = evaluator
  const timeouts = flags.map((flag) => timeoutOf(evaluator, flag))
  const batchTimeoutMs = timeouts.every((timeout) => timeout !== undefined)
    ? Math.max(...timeouts)
    : undefined
  const { fresh, signal: callerSignal } = read
  const batchDeadline = createEvaluationSignal(callerSignal, batchTimeoutMs)
  // Each flag's deadline starts now, so the shared identity resolution counts against it.
  const entries = flags.map((flag, index) => ({
    deadline: createEvaluationSignal(callerSignal, timeouts[index]),
    flag,
  }))

  // Resolve the identity once. Every evaluation in the batch gets this identity, or this error.
  let identifyOnce: IdentitySource<TIdentity>
  try {
    const resolved = await raceWithSignal(identify, batchDeadline.signal)
    identifyOnce = () => Promise.resolve(resolved)
  } catch (error) {
    const identityError = normalizeError(error)
    identifyOnce = () => Promise.reject(identityError)
  }

  let round: FlushRound<TIdentity> | undefined

  const flushRound = async (current: FlushRound<TIdentity>): Promise<void> => {
    // A newer round can replace an aborted one before the aborted one flushes. Keep it open.
    if (round === current) {
      round = undefined
    }
    // The provider signal also aborts when the round settles, so the provider can release its work.
    const settled = new AbortController()
    const signal = AbortSignal.any([current.shared.signal, settled.signal])
    const decisions = [...current.decisions.values()]
    const subject = current.identity
    try {
      const { decideMany } = provider
      if (decideMany) {
        try {
          const roundFlags = decisions.map((decision) => decision.flag)
          const picked = await raceWithSignal(
            () => decideMany(roundFlags, subject, { signal }),
            signal
          )
          for (const decision of decisions) {
            settleDecision(decision, () => pickDecision(picked, decision.flag))
          }
        } catch (error) {
          rejectRound(current, error)
        }
      } else {
        await Promise.allSettled(
          decisions.map(async (decision) => {
            // Each call runs on its key's own signal, so one flag's deadline stops only its call.
            const keySignal = decision.shared.signal
            try {
              const result = await raceWithSignal(
                () => provider.decideOne(decision.flag, subject, { signal: keySignal }),
                keySignal
              )
              settleDecision(decision, () => result)
            } catch (error) {
              decision.pending.reject(normalizeError(error))
            }
          })
        )
      }
    } catch (error) {
      rejectRound(current, error)
    } finally {
      current.shared.release()
      for (const decision of decisions) {
        decision.shared.release()
      }
      settled.abort()
    }
  }

  const joinFlushRound = (
    flag: Flag,
    identity: TIdentity,
    providerSignal: AbortSignal
  ): Promise<unknown> => {
    // A round whose evaluations have all left stays open until its flush, but it can no longer
    // call the provider. A later evaluation opens a new round instead of joining it.
    if (!round || round.shared.signal.aborted) {
      // Every evaluation in the batch decides with the one identity that the batch resolved.
      const current: FlushRound<TIdentity> = {
        decisions: new Map(),
        identity,
        shared: createSharedSignal(),
      }
      setTimeout(() => {
        void flushRound(current)
      }, 0)
      round = current
    }
    let decision = round.decisions.get(flag.key)
    if (!decision) {
      decision = { flag, pending: Promise.withResolvers<unknown>(), shared: createSharedSignal() }
      void decision.pending.promise.catch(() => null)
      round.decisions.set(flag.key, decision)
    }
    round.shared.join(providerSignal)
    decision.shared.join(providerSignal)
    return decision.pending.promise
  }

  // An evaluation asks for a decision only when it needs provider work: after a store miss, and
  // never as a coalesced follower.
  const decide: Decide<TIdentity> = (flag, identity, options) =>
    joinFlushRound(flag, identity, options.signal)

  try {
    return (await Promise.all(
      entries.map(async ({ deadline, flag }) => {
        try {
          return await evaluate(evaluator, flag, identifyOnce, decide, {
            deadline: deadline.signal,
            fresh,
          })
        } finally {
          // Stop this flag's timer as soon as it settles, so its signal never aborts afterward.
          deadline.cleanup()
        }
      })
    )) as Results
  } finally {
    batchDeadline.cleanup()
  }
}
