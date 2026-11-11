import type { Flag } from "#lib/definition/index.ts"
import type { EvaluationContext, Subject } from "#lib/identity/index.ts"
import { type Decision, parsePayload, validateDecision } from "#lib/definition/decision.ts"
import { reportInBackground } from "#lib/shared/report.ts"
import { normalizeError } from "#lib/shared/utils.ts"
import type { DecisionStore, Sharing, StoreFailedReport } from "./config"

type StoreContext<TIdentity extends Subject> = {
  flagKey: string
  identity: TIdentity | null
}

export function storeContext<TIdentity extends Subject>(
  context: EvaluationContext<TIdentity>
): StoreContext<TIdentity> {
  return { flagKey: context.flag.key, identity: context.identity }
}

/**
 * Checks a provider or stored decision against its flag and parses its payload. Throws
 * `InvalidDecisionError`, so a decision whose payload the parser rejects is never stored.
 */
export function accept(decision: unknown, flag: Flag): { decision: Decision; payload: unknown } {
  validateDecision(decision, flag)
  return { decision, payload: parsePayload(flag, decision) }
}

export function reportStoreError<TIdentity extends Subject>(
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

export function deleteCacheEntry<TIdentity extends Subject>(
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

type StoreConsultation = {
  accepted?: { decision: Decision; payload: unknown }
  generation: number
}

export async function consultStore<TIdentity extends Subject>(
  config: Sharing<TIdentity>,
  context: EvaluationContext<TIdentity>,
  flag: Flag,
  store: DecisionStore,
  key: string
): Promise<StoreConsultation> {
  const { state } = config
  const generationBeforeRead = state.writes.generation
  // A refresh that starts while the get is in flight deletes the decision that the get can return.
  const refreshesBeforeRead = state.writes.refreshes
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
  if (
    generation !== generationBeforeRead
    || state.writes.refreshes !== refreshesBeforeRead
    || cached === null
    || cached === undefined
  ) {
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
export type WriteTicket = { epoch: number; generation: number; key: string; store: DecisionStore }

export function openTicket<TIdentity extends Subject>(
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

export function closeTicket<TIdentity extends Subject>(
  config: Sharing<TIdentity>,
  ticket: WriteTicket
) {
  const { tickets } = config.state
  const entry = tickets.get(ticket.key)
  if (!entry) return
  entry.open -= 1
  if (entry.open === 0) tickets.delete(ticket.key)
}

export function writeThrough<TIdentity extends Subject>(
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
    return store.set(key, decision, { flagKey: context.flag.key })
  })
}
