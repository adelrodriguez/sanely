import type { SharedSignal } from "#lib/shared/signals.ts"
import type { Decision, Identity } from "#lib/types/index.ts"

/**
 * One in-flight provider call that concurrent evaluations with one evaluation key share. Every
 * evaluation that waits for it joins `shared`, and the call stops only when all of them have left.
 */
export type PendingResolution = {
  flagKey: string
  promise: Promise<Decision>
  shared: SharedSignal
}

/**
 * The store writes and deletes for one cache key. A store can complete concurrent operations in any
 * order, so a write that started before a change could land after the delete for that change. The
 * operations for one key run one at a time instead, in the order they were issued. `deletes` counts
 * the deletes that have not completed: until they do, the store can still hold a stale decision.
 */
export type StoreMutations = {
  deletes: number
  tail: Promise<unknown>
}

/**
 * Decision memory for one gate factory: in-flight coalesced provider calls plus cache invalidation
 * bookkeeping. Created once per factory so gates from different factories never share state, even
 * when built from the same config object.
 */
export type ResolutionState = {
  keysByFlag: Map<string, Map<string, Identity | null>>
  mutations: Map<string, StoreMutations>
  pending: Map<string, PendingResolution>
  // The invalidation listener never leaves the change broadcaster, so its unsubscribe function is
  // intentionally not retained.
  subscription: { attached: boolean }
  // One factory-wide counter: any flag-change notification invalidates every open write ticket.
  // A pending write lives for milliseconds and the next evaluation re-establishes it, so dropping
  // one is always safe — cheaper than tracking which flags a notification covers.
  writes: { generation: number }
}

export function createResolutionState(): ResolutionState {
  return {
    keysByFlag: new Map(),
    mutations: new Map(),
    pending: new Map(),
    subscription: { attached: false },
    writes: { generation: 0 },
  }
}
