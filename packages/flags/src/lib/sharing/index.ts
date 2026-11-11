import type { Decision, DecisionSource } from "#lib/definition/decision.ts"
import type { Flag } from "#lib/definition/index.ts"
import type { EvaluationContext, Subject } from "#lib/identity/index.ts"
import { createSharedSignal, raceWithSignal } from "#lib/shared/signals.ts"
import { normalizeError, type MaybePromise } from "#lib/shared/utils.ts"
import type { Sharing } from "./config"
import type { PendingResolution } from "./resolution-state"
import { getEvaluationKey } from "./evaluation-key"
import { attachInvalidationSubscription } from "./invalidation"
import {
  accept,
  closeTicket,
  consultStore,
  deleteCacheEntry,
  openTicket,
  reportStoreError,
  storeContext,
  writeThrough,
  type WriteTicket,
} from "./store"

export type {
  CacheOptions,
  DecisionStore,
  Sharing,
  StoreFailedReport,
  SubscribeFailedReport,
} from "./config"
export { createSharing } from "./config"

/**
 * A decision that fits its flag, with its parsed payload. Only an accepted decision is stored or
 * returned.
 */
export type DecisionResolution = {
  decision: Decision
  payload: unknown
  source: DecisionSource
}

/**
 * Drops the reader's decision memory for good: calls in flight and open write tickets. The reader's
 * later reads skip the store and coalescing, so nothing attaches again.
 */
export function disposeSharing<TIdentity extends Subject>(config: Sharing<TIdentity>): void {
  const { state } = config
  state.disposed = true
  state.pending.clear()
  state.tickets.clear()
  state.writes.generation += 1
}

/**
 * Starts the provider call that concurrent evaluations with one evaluation key share, and registers
 * it as pending until it settles. The call runs on a shared signal, not on the signal of the
 * evaluation that started it, so it stops only when every evaluation that joined it has left. With
 * a write ticket, the call stores its accepted decision itself, so the decision is stored even when
 * the evaluation that started the call has already left.
 */
function startSharedCall<TIdentity extends Subject>(
  config: Sharing<TIdentity>,
  context: EvaluationContext<TIdentity>,
  key: string,
  provider: (signal: AbortSignal) => MaybePromise<unknown>,
  write: WriteTicket | undefined
): PendingResolution {
  const { state } = config
  // Attach before the registration, so a change notification can drop this call.
  attachInvalidationSubscription(config)
  const shared = createSharedSignal()
  const promise = raceWithSignal(() => provider(shared.signal), shared.signal).catch(
    (error: unknown) => {
      throw normalizeError(error)
    }
  )
  const accepted = promise.then((decision) => accept(decision, context.flag))
  void accepted.catch(() => null)
  // Each evaluation reports its own invalid decision. The call only skips storing it.
  if (write) {
    void accepted.then(
      ({ decision }) => writeThrough(config, context, write, decision),
      () => {
        closeTicket(config, write)
        return null
      }
    )
  }
  const call: PendingResolution = {
    accepted,
    flag: context.flag,
    flagKey: context.flag.key,
    promise,
    shared,
  }
  state.pending.set(key, call)
  const settle = () => {
    shared.release()
    if (state.pending.get(key) === call) {
      state.pending.delete(key)
    }
  }
  void promise.then(settle, settle)
  return call
}

/**
 * Resolves one decision through the reader's memory. It joins an in-flight coalesced call, falls
 * back to the store, and otherwise leads the provider call, which shares the decision with
 * followers and writes it through to the store. It validates the decision on every path, so a
 * decision that leaves this function fits the flag.
 *
 * `provider` receives the signal for the provider work. It is the evaluation's own signal, except
 * for a coalesced call, where it is the call's shared signal.
 */
export async function resolveDecision<TIdentity extends Subject>(
  config: Sharing<TIdentity>,
  context: EvaluationContext<TIdentity>,
  flag: Flag,
  provider: (signal: AbortSignal) => MaybePromise<unknown>,
  signal: AbortSignal,
  fresh: boolean
): Promise<DecisionResolution> {
  const { coalesce, state } = config
  const store = config.store

  let key: string | undefined
  try {
    key = getEvaluationKey(context, config.provider, config.key)
  } catch (error) {
    reportStoreError(config, storeContext(context), "key", context.flag.key, error)
    key = undefined
  }

  if (key === undefined || state.disposed || (!store && !coalesce)) {
    const decision = await raceWithSignal(() => provider(signal), signal)
    return { ...accept(decision, flag), source: "provider" }
  }

  let write: WriteTicket | undefined
  if (store) {
    attachInvalidationSubscription(config)
    // A fresh read skips the stored decision but still stores the provider's. Its ticket voids
    // the older tickets of its key, so a slower older call cannot store over its decision.
    const consultation = fresh
      ? { generation: state.writes.generation }
      : await raceWithSignal(() => consultStore(config, context, flag, store, key), signal)
    if (consultation.accepted) {
      return { ...consultation.accepted, source: "cache" }
    }
    write = openTicket(config, store, key, consultation.generation, fresh)
    // A fresh read deletes the decision it replaces before it asks the provider. Reads of the key
    // skip the store while the delete is pending and miss it afterward, so none of them returns
    // the old decision, even when this read's own write later fails or stalls.
    if (fresh) {
      state.writes.refreshes += 1
      deleteCacheEntry(config, storeContext(context), store, key)
    }
  }

  if (!coalesce) {
    let accepted: { decision: Decision; payload: unknown }
    try {
      accepted = accept(await raceWithSignal(() => provider(signal), signal), flag)
    } catch (error) {
      if (write) closeTicket(config, write)
      throw error
    }
    if (write) void writeThrough(config, context, write, accepted.decision)
    return { ...accepted, source: "provider" }
  }

  // The in-flight check, the leadership registration, and the join must stay in one synchronous
  // block: an await between them lets two concurrent evaluations both miss the pending map and
  // both lead, or lets the shared call stop before this evaluation joins it.
  // A fresh read starts its own call, which later evaluations join instead of an older one.
  const existing = fresh ? undefined : state.pending.get(key)
  const call =
    existing && !existing.shared.signal.aborted
      ? existing
      : startSharedCall(config, context, key, provider, write)
  // Only the call that this evaluation started stores the decision, with this evaluation's ticket.
  if (write && call === existing) closeTicket(config, write)
  call.shared.join(signal)

  // Each evaluation waits on its own signal: leaving never cancels the call for the others.
  // An evaluation of the definition that started the call reuses its parse. Another definition with
  // the same evaluation key can have another payload parser, so it parses for itself.
  const resolution =
    flag === call.flag
      ? await raceWithSignal(() => call.accepted, signal)
      : accept(await raceWithSignal(() => call.promise, signal), flag)
  return { ...resolution, source: "provider" }
}
