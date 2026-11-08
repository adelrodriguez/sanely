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
type FlushRound = {
  decisions: Map<string, RoundDecision>
  flags: Map<string, Flag>
  shared: SharedSignal
}

type RoundDecision = {
  pending: PromiseWithResolvers<unknown>
  shared: SharedSignal
}

function settleRound(round: FlushRound, flag: Flag, settle: () => unknown): void {
  const decision = round.decisions.get(flag.key)
  try {
    decision?.pending.resolve(settle())
  } catch (error) {
    decision?.pending.reject(normalizeError(error))
  }
}

function rejectRound(round: FlushRound, error: unknown): void {
  for (const decision of round.decisions.values()) {
    decision.pending.reject(normalizeError(error))
  }
}

/**
 * Evaluates several flags with one identity resolution. Each flag keeps its own hooks, validation,
 * timeout, fallback, and details. The results keep the order of `flags`.
 */
export async function evaluateMany<TIdentity extends Subject, const TFlags extends readonly Flag[]>(
  evaluator: Evaluator<TIdentity>,
  flags: TFlags,
  identify: IdentitySource<TIdentity>,
  callerSignal: AbortSignal | undefined
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
  const batchDeadline = createEvaluationSignal(callerSignal, batchTimeoutMs)

  // Resolve the identity once. Every evaluation in the batch gets this identity, or this error.
  // A flush round opens only after an evaluation resolved this identity, so the round reads it.
  let identity: TIdentity | undefined
  let identifyOnce: IdentitySource<TIdentity>
  try {
    const resolved = await raceWithSignal(identify, batchDeadline.signal)
    identity = resolved
    identifyOnce = () => Promise.resolve(resolved)
  } catch (error) {
    const identityError = normalizeError(error)
    identifyOnce = () => Promise.reject(identityError)
  }

  let round: FlushRound | undefined

  const flushRound = async (current: FlushRound): Promise<void> => {
    // A newer round can replace an aborted one before the aborted one flushes. Keep it open.
    if (round === current) {
      round = undefined
    }
    // The provider signal also aborts when the round settles, so the provider can release its work.
    const settled = new AbortController()
    const signal = AbortSignal.any([current.shared.signal, settled.signal])
    const roundFlags = [...current.flags.values()]
    try {
      if (identity === undefined) {
        throw new TypeError("A flush round needs a resolved identity")
      }
      const subject = identity
      const { decideMany } = provider
      if (decideMany) {
        try {
          const decisions = await raceWithSignal(
            () => decideMany(roundFlags, subject, { signal }),
            signal
          )
          for (const flag of roundFlags) {
            settleRound(current, flag, () => pickDecision(decisions, flag))
          }
        } catch (error) {
          rejectRound(current, error)
        }
      } else {
        await Promise.allSettled(
          roundFlags.map(async (flag) => {
            // Each call runs on its key's own signal, so one flag's deadline stops only its call.
            const keySignal = current.decisions.get(flag.key)?.shared.signal ?? signal
            try {
              const decision = await raceWithSignal(
                () => provider.decideOne(flag, subject, { signal: keySignal }),
                keySignal
              )
              settleRound(current, flag, () => decision)
            } catch (error) {
              current.decisions.get(flag.key)?.pending.reject(normalizeError(error))
            }
          })
        )
      }
    } catch (error) {
      rejectRound(current, error)
    } finally {
      current.shared.release()
      for (const decision of current.decisions.values()) {
        decision.shared.release()
      }
      settled.abort()
    }
  }

  const joinFlushRound = (flag: Flag, providerSignal: AbortSignal): Promise<unknown> => {
    // A round whose evaluations have all left stays open until its flush, but it can no longer
    // call the provider. A later evaluation opens a new round instead of joining it.
    if (!round || round.shared.signal.aborted) {
      const current: FlushRound = {
        decisions: new Map(),
        flags: new Map(),
        shared: createSharedSignal(),
      }
      setTimeout(() => {
        void flushRound(current)
      }, 0)
      round = current
    }
    let decision = round.decisions.get(flag.key)
    if (!decision) {
      decision = { pending: Promise.withResolvers<unknown>(), shared: createSharedSignal() }
      void decision.pending.promise.catch(() => null)
      round.decisions.set(flag.key, decision)
      round.flags.set(flag.key, flag)
    }
    round.shared.join(providerSignal)
    decision.shared.join(providerSignal)
    return decision.pending.promise
  }

  // An evaluation asks for a decision only when it needs provider work: after a store miss, and
  // never as a coalesced follower.
  const decide: Decide<TIdentity> = (flag, _identity, options) =>
    joinFlushRound(flag, options.signal)

  try {
    return (await Promise.all(
      flags.map(async (flag, index) => {
        const deadline = createEvaluationSignal(callerSignal, timeouts[index])
        try {
          return await evaluate(evaluator, flag, identifyOnce, decide, {
            deadline: deadline.signal,
          })
        } finally {
          deadline.cleanup()
        }
      })
    )) as Results
  } finally {
    batchDeadline.cleanup()
  }
}
