import type { ResolvedConfig } from "#lib/config/resolved-config.ts"
import type {
  Decision,
  EvaluationDetails,
  GateCallOptions,
  GateOptions,
  Identity,
} from "#lib/types/index.ts"
import { DuplicateBatchKeyError } from "#lib/shared/errors.ts"
import {
  createEvaluationSignal,
  createSharedSignal,
  raceWithSignal,
  type SharedSignal,
} from "#lib/shared/signals.ts"
import { normalizeError } from "#lib/shared/utils.ts"
import { executeGateDetails, type GateSource } from "./engine"

export type BatchEntry = {
  flag: object
  options: GateOptions<string[]>
}

/**
 * One `decideMany` call shared by every evaluation that needed provider work in the same tick.
 * Entries join the open round; the round closes when its timer fires, so evaluations that resolve
 * from cache never delay or join it. Each entry joins `shared` with its provider signal, so the
 * call stops only when every entry has left, and not when the batch returns: an entry can lead a
 * coalesced call that an evaluation outside the batch still waits for.
 */
type FlushRound = {
  keys: string[]
  promise: Promise<Record<string, Decision>>
  reject: (error: Error) => void
  resolve: (decisions: Record<string, Decision>) => void
  shared: SharedSignal
}

export async function executeGateBatch<TIdentity extends Identity>(
  config: ResolvedConfig<TIdentity>,
  entries: readonly BatchEntry[],
  callOptions?: GateCallOptions<TIdentity | null>
): Promise<Map<object, EvaluationDetails<boolean | string>>> {
  if (entries.length === 0) {
    return new Map()
  }

  const duplicateKey = entries
    .map((entry) => entry.options.key)
    .find((key, index, keys) => keys.indexOf(key) !== index)
  if (duplicateKey !== undefined) {
    throw new DuplicateBatchKeyError(duplicateKey)
  }

  const entryTimeouts = new Map(
    entries.map((entry) => [entry.flag, entry.options.timeoutMs ?? config.timeoutMs])
  )
  const effectiveTimeouts = [...entryTimeouts.values()]
  const batchTimeoutMs = effectiveTimeouts.includes(undefined)
    ? undefined
    : Math.max(...(effectiveTimeouts as number[]))
  const batchTimeout = createEvaluationSignal(callOptions?.signal, batchTimeoutMs)
  const { signal } = batchTimeout
  const entrySignals = new Map(
    entries.map((entry) => [
      entry.flag,
      createEvaluationSignal(callOptions?.signal, entryTimeouts.get(entry.flag)),
    ])
  )

  // Resolve the identity once. Every evaluation in the batch gets this identity, or this error.
  // A flush round opens only after an evaluation resolved this identity, so the round reads it.
  let identity: TIdentity | null = null
  let resolveIdentity: GateSource<TIdentity>["resolveIdentity"]
  try {
    const resolved = await raceWithSignal(
      () => config.resolveIdentity(callOptions?.identity),
      signal
    )
    identity = resolved
    resolveIdentity = () => Promise.resolve(resolved)
  } catch (error) {
    const identityError = normalizeError(error)
    resolveIdentity = () => Promise.reject(identityError)
  }

  let round: FlushRound | undefined

  const flushRound = async (current: FlushRound): Promise<void> => {
    // A newer round can replace an aborted one before the aborted one flushes. Keep it open.
    if (round === current) {
      round = undefined
    }
    // The provider signal also aborts when the round settles, so the provider can release its work.
    const settled = new AbortController()
    const roundSignal = AbortSignal.any([current.shared.signal, settled.signal])
    try {
      current.resolve(
        await raceWithSignal(
          () => config.decideMany?.(current.keys, identity, { signal: roundSignal }) ?? {},
          roundSignal
        )
      )
    } catch (error) {
      current.reject(normalizeError(error))
    } finally {
      current.shared.release()
      settled.abort()
    }
  }

  const joinFlushRound = (
    key: string,
    providerSignal: AbortSignal
  ): Promise<Record<string, Decision>> => {
    // A round whose entries have all left stays open until its flush, but it can no longer call the
    // provider. A later entry opens a new round instead of joining it.
    if (!round || round.shared.signal.aborted) {
      const { promise, reject, resolve } = Promise.withResolvers<Record<string, Decision>>()
      void promise.catch(() => null)
      const current: FlushRound = {
        keys: [],
        promise,
        reject,
        resolve,
        shared: createSharedSignal(),
      }
      setTimeout(() => {
        void flushRound(current)
      }, 0)
      round = current
    }
    round.keys.push(key)
    round.shared.join(providerSignal)
    return round.promise
  }

  // An evaluation calls `decide` only when it needs provider work: after a cache miss, and never as
  // a coalesced follower. Those evaluations share one `decideMany` call for each flush round.
  const source: GateSource<TIdentity> = {
    async decide(key, identity, options) {
      const decisions = await joinFlushRound(key, options.signal)
      const batched = Object.hasOwn(decisions, key) ? decisions[key] : undefined
      if (batched) {
        return batched
      }
      return await config.decide(key, identity, options)
    },
    resolveIdentity,
  }

  const evaluations = entries.map((entry) => {
    const entrySignal = entrySignals.get(entry.flag)
    return {
      evaluation: executeGateDetails(config, entry.options, callOptions, source, {
        signal: entrySignal?.signal ?? signal,
      }).finally(() => {
        entrySignal?.cleanup()
      }),
      flag: entry.flag,
    }
  })

  try {
    const settled = await Promise.all(
      evaluations.map(async ({ evaluation, flag }) => ({
        details: await evaluation,
        flag,
      }))
    )
    return new Map(settled.map(({ details, flag }) => [flag, details]))
  } finally {
    batchTimeout.cleanup()
  }
}
