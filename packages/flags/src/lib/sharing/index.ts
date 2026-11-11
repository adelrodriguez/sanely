import type { ChangeBroadcaster } from "#lib/changes/index.ts"
import type { Flag } from "#lib/definition/index.ts"
import type { EvaluationContext, Subject } from "#lib/identity/index.ts"
import {
  type Decision,
  type DecisionSource,
  parsePayload,
  validateDecision,
} from "#lib/definition/decision.ts"
import { reportInBackground } from "#lib/shared/report.ts"
import { createSharedSignal, raceWithSignal } from "#lib/shared/signals.ts"
import { normalizeError, type MaybePromise } from "#lib/shared/utils.ts"
import type { PendingResolution, ResolutionState } from "./resolution-state"
import { getEvaluationKey } from "./evaluation-key"
import { createResolutionState } from "./resolution-state"

/**
 * A store for decisions. The store owns serialization and expiry.
 *
 * Variant payloads can contain values that are not JSON-safe. A persistent store must preserve them
 * or normalize them for the provider.
 */
export type DecisionStore = {
  delete?(key: string): Promise<unknown>
  get(key: string): Promise<Decision | null | undefined>
  set(key: string, decision: Decision): Promise<void>
}

/**
 * A store operation failed. The evaluation continued without the store.
 */
export type StoreFailedReport<TIdentity extends Subject = Subject> = {
  readonly _tag: "StoreFailed"
  readonly error: Error
  readonly flagKey: string
  readonly identity: TIdentity | null
  /**
   * The evaluation key, or the flag key when the `key` function failed.
   */
  readonly key: string
  readonly operation: "delete" | "get" | "key" | "set" | "validate"
}

/**
 * The provider's `subscribe` threw. Evaluations continue without live invalidation, and the next
 * evaluation or listener tries again.
 */
export type SubscribeFailedReport = {
  readonly _tag: "SubscribeFailed"
  readonly error: Error
}

export type CacheOptions<TIdentity extends Subject> = {
  /**
   * Concurrent evaluations with one evaluation key share one provider call. Defaults to `true`. Set
   * `false` when the provider has side effects for each call, such as exposure logging.
   */
  coalesce?: boolean
  /**
   * Replaces the evaluation key, which the store and coalescing use to identify interchangeable
   * evaluations.
   */
  key?: (context: EvaluationContext<TIdentity>) => string
  store?: DecisionStore
}

/**
 * One reader's decision memory and the options that control it.
 */
export type Sharing<TIdentity extends Subject> = {
  changes: ChangeBroadcaster | undefined
  coalesce: boolean
  key: ((context: EvaluationContext<TIdentity>) => string) | undefined
  onError:
    | ((report: StoreFailedReport<TIdentity> | SubscribeFailedReport) => MaybePromise<void>)
    | undefined
  state: ResolutionState<TIdentity>
  store: DecisionStore | undefined
}

export function createSharing<TIdentity extends Subject>(
  options: CacheOptions<TIdentity> | undefined,
  changes: ChangeBroadcaster | undefined,
  onError: Sharing<TIdentity>["onError"]
): Sharing<TIdentity> {
  return {
    changes,
    coalesce: options?.coalesce !== false,
    key: options?.key,
    onError,
    state: createResolutionState(),
    store: options?.store,
  }
}

type StoreContext<TIdentity extends Subject> = {
  flagKey: string
  identity: TIdentity | null
}

function storeContext<TIdentity extends Subject>(
  context: EvaluationContext<TIdentity>
): StoreContext<TIdentity> {
  return { flagKey: context.flag.key, identity: context.identity }
}

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
 * Checks a provider or stored decision against its flag and parses its payload. Throws
 * `InvalidDecisionError`, so a decision whose payload the parser rejects is never stored.
 */
function accept(decision: unknown, flag: Flag): { decision: Decision; payload: unknown } {
  validateDecision(decision, flag)
  return { decision, payload: parsePayload(flag, decision) }
}

function reportStoreError<TIdentity extends Subject>(
  config: Sharing<TIdentity>,
  context: StoreContext<TIdentity>,
  operation: StoreFailedReport["operation"],
  key: string,
  error: unknown
): void {
  reportInBackground(config.onError, {
    _tag: "StoreFailed",
    error: normalizeError(error),
    flagKey: context.flagKey,
    identity: context.identity,
    key,
    operation,
  })
}

/**
 * Queues one store operation behind the earlier operations for the same key. A failed operation is
 * reported and does not stop the operations after it.
 */
function mutateStore<TIdentity extends Subject>(
  config: Sharing<TIdentity>,
  context: StoreContext<TIdentity>,
  key: string,
  operation: "delete" | "set",
  mutation: () => Promise<unknown> | undefined
): void {
  const { mutations } = config.state
  const queue = mutations.get(key) ?? { deletes: 0, tail: Promise.resolve() }
  if (operation === "delete") {
    queue.deletes += 1
  }
  const tail = queue.tail
    .then(mutation)
    .catch((error: unknown) => {
      reportStoreError(config, context, operation, key, error)
    })
    .then(() => {
      if (operation === "delete") {
        queue.deletes -= 1
      }
      if (queue.tail === tail) {
        mutations.delete(key)
      }
      return null
    })
  queue.tail = tail
  mutations.set(key, queue)
}

function deleteCacheEntry<TIdentity extends Subject>(
  config: Sharing<TIdentity>,
  context: StoreContext<TIdentity>,
  store: DecisionStore,
  key: string
): void {
  if (!store.delete) {
    return
  }
  mutateStore(config, context, key, "delete", () => store.delete?.(key))
}

function indexCacheKey<TIdentity extends Subject>(
  config: Sharing<TIdentity>,
  context: EvaluationContext<TIdentity>,
  store: DecisionStore,
  key: string
): void {
  if (!store.delete || !config.changes) {
    return
  }

  const { state } = config
  const keys = state.keysByFlag.get(context.flag.key) ?? new Map<string, TIdentity | null>()
  keys.set(key, context.identity)
  state.keysByFlag.set(context.flag.key, keys)
}

/**
 * Adds the listener that invalidates this reader's decision memory to the change broadcaster: it
 * drops in-flight coalesced calls and deletes indexed store entries for the changed flags, and
 * invalidates every pending cache write regardless of which flags changed. Added on the first
 * evaluation that touches cache or coalescing and never removed, so the provider stays attached for
 * the reader's lifetime. A throwing `subscribe` never fails the evaluation: it is reported through
 * `onError` and the evaluation continues without invalidation. The next evaluation tries again.
 */
function attachInvalidationSubscription<TIdentity extends Subject>(
  config: Sharing<TIdentity>
): void {
  const { changes, state } = config
  if (!changes) {
    return
  }
  // The listener is registered once. Later evaluations ask the broadcaster to attach again when an
  // earlier attach failed.
  if (state.subscription.registered) {
    changes.attach()
    return
  }

  // Set before the attach, so a provider that notifies synchronously cannot add a second listener.
  state.subscription.registered = true
  changes.subscribe((changedFlagKeys) => {
    // An invalidated flag's in-flight provider call is stale too: already-attached followers
    // keep the leader's decision, but later evaluations must not join it.
    const changed = changedFlagKeys && new Set(changedFlagKeys)
    for (const [pendingKey, entry] of state.pending) {
      if (!changed || changed.has(entry.flagKey)) {
        state.pending.delete(pendingKey)
      }
    }
    // Invalidate open write tickets independently of the key index, which only fills when the
    // store can delete: a decision fetched before the change must never be written after it.
    const { writes } = state
    writes.generation += 1
    // Only a write to the store indexes a key, so without a store there is nothing to delete.
    const store = config.store
    if (!store) {
      return
    }
    const flagKeys = changedFlagKeys ?? [...state.keysByFlag.keys()]
    for (const flagKey of flagKeys) {
      const cacheKeys = state.keysByFlag.get(flagKey)
      if (!cacheKeys) {
        continue
      }
      state.keysByFlag.delete(flagKey)
      for (const [cacheKey, identity] of cacheKeys) {
        deleteCacheEntry(config, { flagKey, identity }, store, cacheKey)
      }
    }
  })
}

type StoreConsultation = {
  accepted?: { decision: Decision; payload: unknown }
  generation: number
}

async function consultStore<TIdentity extends Subject>(
  config: Sharing<TIdentity>,
  context: EvaluationContext<TIdentity>,
  flag: Flag,
  store: DecisionStore,
  key: string
): Promise<StoreConsultation> {
  const { state } = config
  const generationBeforeRead = state.writes.generation
  // The delete for an earlier change has not completed, so the store can hold a stale decision.
  if (state.mutations.get(key)?.deletes) {
    return { generation: generationBeforeRead }
  }

  let cached: Decision | null | undefined
  try {
    cached = await store.get(key)
  } catch (error) {
    reportStoreError(config, storeContext(context), "get", key, error)
    return { generation: state.writes.generation }
  }
  const generation = state.writes.generation
  if (generation !== generationBeforeRead || cached === null || cached === undefined) {
    return { generation }
  }

  try {
    return { accepted: accept(cached, flag), generation }
  } catch (error) {
    reportStoreError(config, storeContext(context), "validate", key, error)
    deleteCacheEntry(config, storeContext(context), store, key)
    return { generation }
  }
}

function writeThrough<TIdentity extends Subject>(
  config: Sharing<TIdentity>,
  context: EvaluationContext<TIdentity>,
  store: DecisionStore,
  generation: number,
  key: string,
  decision: Decision
): void {
  // The generation check runs when the write starts, after the earlier operations for this key. A
  // change during the write queues its delete after the write.
  mutateStore(config, storeContext(context), key, "set", () => {
    if (config.state.writes.generation !== generation) {
      return
    }
    // A change during the read removed this key from the index, so index it again for the decision
    // that this write stores.
    indexCacheKey(config, context, store, key)
    return store.set(key, decision)
  })
}

type WriteTicket = { generation: number; store: DecisionStore }

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
  const call: PendingResolution = { flagKey: context.flag.key, promise, shared }
  state.pending.set(key, call)
  const settle = () => {
    shared.release()
    if (state.pending.get(key) === call) {
      state.pending.delete(key)
    }
  }
  void promise.then(settle, settle)
  if (write) {
    const { generation, store } = write
    const storeDecision = (decision: unknown): null => {
      try {
        const { decision: accepted } = accept(decision, context.flag)
        writeThrough(config, context, store, generation, key, accepted)
      } catch {
        // Each evaluation reports its own invalid decision. The call only skips storing it.
      }
      return null
    }
    void promise.then(storeDecision, () => null)
  }
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
  signal: AbortSignal
): Promise<DecisionResolution> {
  const { coalesce, state } = config
  const store = config.store

  let key: string | undefined
  try {
    key = getEvaluationKey(context, config.key)
  } catch (error) {
    reportStoreError(config, storeContext(context), "key", context.flag.key, error)
    key = undefined
  }

  if (key === undefined || (!store && !coalesce)) {
    const decision = await raceWithSignal(() => provider(signal), signal)
    return { ...accept(decision, flag), source: "provider" }
  }

  let write: WriteTicket | undefined
  if (store) {
    indexCacheKey(config, context, store, key)
    attachInvalidationSubscription(config)
    const consultation = await raceWithSignal(
      () => consultStore(config, context, flag, store, key),
      signal
    )
    if (consultation.accepted) {
      return { ...consultation.accepted, source: "cache" }
    }
    write = { generation: consultation.generation, store }
  }

  if (!coalesce) {
    const accepted = accept(await raceWithSignal(() => provider(signal), signal), flag)
    if (write) {
      writeThrough(config, context, write.store, write.generation, key, accepted.decision)
    }
    return { ...accepted, source: "provider" }
  }

  // The in-flight check, the leadership registration, and the join must stay in one synchronous
  // block: an await between them lets two concurrent evaluations both miss the pending map and
  // both lead, or lets the shared call stop before this evaluation joins it.
  const existing = state.pending.get(key)
  const call =
    existing && !existing.shared.signal.aborted
      ? existing
      : startSharedCall(config, context, key, provider, write)
  call.shared.join(signal)

  // Each evaluation waits on its own signal: leaving never cancels the call for the others.
  return { ...accept(await raceWithSignal(() => call.promise, signal), flag), source: "provider" }
}
