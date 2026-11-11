import type { Decision } from "#lib/definition/decision.ts"
import type { Flag } from "#lib/definition/index.ts"
import type { Subject } from "#lib/identity/index.ts"
import type { SharedSignal } from "#lib/shared/signals.ts"

/**
 * One in-flight provider call that concurrent evaluations with one evaluation key share. Every
 * evaluation that waits for it joins `shared`, and the call stops only when all of them have left.
 */
export type PendingResolution = {
  /**
   * The call's decision checked and parsed once for `flag`, the definition that started the call.
   * An evaluation of that definition reuses it, so its payload parser runs once.
   */
  accepted: Promise<{ decision: Decision; payload: unknown }>
  flag: Flag
  flagKey: string
  promise: Promise<unknown>
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
  flagKey: string
  tail: Promise<unknown>
}

/**
 * The `deleteFlags` calls that have not completed, for each flag key and for every flag. Until one
 * completes, the store can still hold a stale decision of those flags.
 */
export type FlagDeletes = { all: number; byFlag: Map<string, number> }

/**
 * Decision memory for one reader: in-flight coalesced provider calls plus cache invalidation
 * bookkeeping. Created once per `createFlags` call, so two readers never share state, even when
 * built from the same options.
 */
export type ResolutionState<TIdentity extends Subject> = {
  // A disposed reader keeps no decision memory: its reads go straight to the provider.
  disposed: boolean
  flagDeletes: FlagDeletes
  keysByFlag: Map<string, Map<string, TIdentity | null>>
  mutations: Map<string, StoreMutations>
  pending: Map<string, PendingResolution>
  // The invalidation listener never leaves the change broadcaster, so its unsubscribe function is
  // intentionally not retained.
  subscription: { registered: boolean }
  // One counter for the reader: any flag-change notification invalidates every open write ticket.
  // A pending write lives for milliseconds and the next evaluation re-establishes it, so dropping
  // one is always safe. It is cheaper than tracking which flags a notification covers.
  writes: { generation: number }
  // The open write tickets of each evaluation key. A fresh read advances its key's epoch, which
  // voids only that key's older tickets. A key leaves the map when its last ticket closes, so the
  // map holds only keys with a read in flight.
  tickets: Map<string, { epoch: number; open: number }>
}

export function createResolutionState<TIdentity extends Subject>(): ResolutionState<TIdentity> {
  return {
    disposed: false,
    flagDeletes: { all: 0, byFlag: new Map() },
    keysByFlag: new Map(),
    mutations: new Map(),
    pending: new Map(),
    subscription: { registered: false },
    tickets: new Map(),
    writes: { generation: 0 },
  }
}
