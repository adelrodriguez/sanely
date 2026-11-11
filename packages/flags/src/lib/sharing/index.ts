import type { ChangeBroadcaster } from "#lib/changes/index.ts"
import type { Flag } from "#lib/definition/index.ts"
import type { EvaluationContext, Subject } from "#lib/identity/index.ts"
import type { FlagCacheKey } from "#lib/promise-cache/key.ts"
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
  /**
   * Deletes every stored decision of these flag keys, or of every flag without keys, including the
   * decisions that other processes stored. A change notification calls it. A store with it needs no
   * `delete`, and the reader keeps no index of the keys it stored.
   */
  deleteFlags?(flagKeys?: readonly string[]): Promise<unknown>
  get(key: string): Promise<Decision | null | undefined>
  /**
   * Stores a decision. `entry.flagKey` names its flag, so a store with `deleteFlags` can find it.
   */
  set(key: string, decision: Decision, entry: { readonly flagKey: string }): Promise<void>
}

/**
 * A store operation failed. The evaluation continued without the store. `operation` tells an
 * operation on one entry from `deleteFlags`, which has no entry.
 */
export type StoreFailedReport<TIdentity extends Subject = Subject> =
  | {
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
  | {
      readonly _tag: "StoreFailed"
      readonly error: Error
      /**
       * The changed flag keys, or `undefined` when the notification named none.
       */
      readonly flagKeys: readonly string[] | undefined
      readonly operation: "deleteFlags"
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
   * Returns the identity fields, beyond `distinctId`, that change the decision, such as a plan or a
   * tenant. The package adds them to the evaluation key, which the store and coalescing use to
   * identify interchangeable evaluations. It keeps the provider, the flag, and `distinctId` in the
   * key, so two flags never share a decision.
   */
  key?: (context: EvaluationContext<TIdentity>) => readonly FlagCacheKey[]
  store?: DecisionStore
}

/**
 * One reader's decision memory and the options that control it.
 */
export type Sharing<TIdentity extends Subject> = {
  changes: ChangeBroadcaster | undefined
  coalesce: boolean
  key: ((context: EvaluationContext<TIdentity>) => readonly FlagCacheKey[]) | undefined
  onError:
    | ((report: StoreFailedReport<TIdentity> | SubscribeFailedReport) => MaybePromise<void>)
    | undefined
  // The provider's name, which the default evaluation key holds.
  provider: string
  state: ResolutionState<TIdentity>
  store: DecisionStore | undefined
}

export function createSharing<TIdentity extends Subject>(
  options: CacheOptions<TIdentity> | undefined,
  provider: string,
  changes: ChangeBroadcaster | undefined,
  onError: Sharing<TIdentity>["onError"]
): Sharing<TIdentity> {
  return {
    changes,
    coalesce: options?.coalesce !== false,
    key: options?.key,
    onError,
    provider,
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
  operation: Exclude<StoreFailedReport["operation"], "deleteFlags">,
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
): Promise<unknown> {
  const { mutations } = config.state
  const queue = mutations.get(key) ?? {
    deletes: 0,
    flagKey: context.flagKey,
    tail: Promise.resolve(),
  }
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
  return tail
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
  void mutateStore(config, context, key, "delete", () => store.delete?.(key))
}

function indexCacheKey<TIdentity extends Subject>(
  config: Sharing<TIdentity>,
  context: EvaluationContext<TIdentity>,
  store: DecisionStore,
  key: string
): void {
  // A store with `deleteFlags` finds a flag's entries itself, so the reader indexes nothing.
  if (!store.delete || store.deleteFlags || !config.changes) {
    return
  }

  const { state } = config
  const keys = state.keysByFlag.get(context.flag.key) ?? new Map<string, TIdentity | null>()
  keys.set(key, context.identity)
  state.keysByFlag.set(context.flag.key, keys)
}

/**
 * Calls the store's `deleteFlags` for a change, after the writes of the changed flags that already
 * started, so none of them lands after the delete. Until it completes, reads of those flags skip
 * the store. A failure is reported and leaves the entries to the store's expiry.
 */
function deleteFlags<TIdentity extends Subject>(
  config: Sharing<TIdentity>,
  remove: (flagKeys?: readonly string[]) => Promise<unknown>,
  flagKeys: readonly string[] | undefined
): void {
  const { flagDeletes, mutations } = config.state
  const changed = flagKeys && new Set(flagKeys)
  const writes = [...mutations.values()]
    .filter((queue) => !changed || changed.has(queue.flagKey))
    .map((queue) => queue.tail)
  const track = (step: 1 | -1) => {
    if (!flagKeys) {
      flagDeletes.all += step
      return
    }
    for (const flagKey of flagKeys) {
      const count = (flagDeletes.byFlag.get(flagKey) ?? 0) + step
      if (count === 0) flagDeletes.byFlag.delete(flagKey)
      else flagDeletes.byFlag.set(flagKey, count)
    }
  }
  track(1)
  void Promise.allSettled(writes)
    .then(() => remove(flagKeys))
    .catch((error: unknown) => {
      reportInBackground(config.onError, {
        _tag: "StoreFailed",
        error: normalizeError(error),
        flagKeys,
        operation: "deleteFlags",
      })
    })
    .finally(() => {
      track(-1)
    })
}

/**
 * Drops the reader's decision memory for good: calls in flight, the key index, and open write
 * tickets. The reader's later reads skip the store and coalescing, so nothing attaches again.
 */
export function disposeSharing<TIdentity extends Subject>(config: Sharing<TIdentity>): void {
  const { state } = config
  state.disposed = true
  state.pending.clear()
  state.tickets.clear()
  state.keysByFlag.clear()
  state.writes.generation += 1
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
    if (store.deleteFlags) {
      deleteFlags(config, store.deleteFlags.bind(store), changedFlagKeys)
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
  const { flagDeletes } = state
  if (
    state.mutations.get(key)?.deletes
    || flagDeletes.all > 0
    || (flagDeletes.byFlag.get(flag.key) ?? 0) > 0
  ) {
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

/**
 * A read's permission to store the decision it fetches. A change notification voids every open
 * ticket through `generation`, and a fresh read voids the older tickets of its key through `epoch`.
 * Each ticket closes once: when its write starts, or when its read ends without one.
 */
type WriteTicket = { epoch: number; generation: number; key: string; store: DecisionStore }

function openTicket<TIdentity extends Subject>(
  config: Sharing<TIdentity>,
  store: DecisionStore,
  key: string,
  generation: number,
  fresh: boolean
): WriteTicket {
  const { tickets } = config.state
  const entry = tickets.get(key) ?? { epoch: 0, open: 0 }
  if (fresh) entry.epoch += 1
  entry.open += 1
  tickets.set(key, entry)
  return { epoch: entry.epoch, generation, key, store }
}

function closeTicket<TIdentity extends Subject>(config: Sharing<TIdentity>, ticket: WriteTicket) {
  const { tickets } = config.state
  const entry = tickets.get(ticket.key)
  if (!entry) return
  entry.open -= 1
  if (entry.open === 0) tickets.delete(ticket.key)
}

function writeThrough<TIdentity extends Subject>(
  config: Sharing<TIdentity>,
  context: EvaluationContext<TIdentity>,
  ticket: WriteTicket,
  decision: Decision
): Promise<unknown> {
  const { key, store } = ticket
  // The checks run when the write starts, after the earlier operations for this key. A change
  // during the write queues its delete after the write.
  return mutateStore(config, storeContext(context), key, "set", () => {
    const epoch = config.state.tickets.get(key)?.epoch
    closeTicket(config, ticket)
    if (config.state.writes.generation !== ticket.generation || epoch !== ticket.epoch) {
      return
    }
    // A change during the read removed this key from the index, so index it again for the decision
    // that this write stores.
    indexCacheKey(config, context, store, key)
    return store.set(key, decision, { flagKey: context.flag.key })
  })
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
    indexCacheKey(config, context, store, key)
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
    if (fresh) deleteCacheEntry(config, storeContext(context), store, key)
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
