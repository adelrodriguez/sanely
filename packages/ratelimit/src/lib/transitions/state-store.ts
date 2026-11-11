import type { Store, StoreResult } from "#lib/store/index.ts"
import type { State } from "./index.ts"
import { transition } from "./index.ts"

export type StateStoreOptions = {
  /**
   * Reads the state saved for `key` and the store's clock in epoch ms, calls `apply` with them,
   * saves the `state` that `apply` returns when there is one, and resolves with its `result`. All
   * of it must be one atomic step, such as a database transaction that locks the key. The saved
   * state can be deleted at its `expiresAt`, on the store's clock.
   */
  readonly update: (
    key: string,
    apply: (
      saved: unknown,
      now: number
    ) => { readonly result: StoreResult; readonly state?: State | undefined }
  ) => Promise<StoreResult>
  /**
   * Deletes the state saved for `key`.
   */
  readonly clear: (key: string) => Promise<void>
}

/**
 * Builds a store from an atomic read and write of one key. The package applies the algorithm, and
 * decides what to save: nothing for a denial or a cost of 0. A saved value that is not a state this
 * package wrote, or that is past its `expiresAt`, counts as no state.
 */
export function stateStore({ clear, update }: StateStoreOptions): Store {
  return {
    clear,
    consume: ({ algorithm, cost, key }) =>
      update(key, (saved, now) => transition(algorithm, parseState(saved, now), cost, now)),
  }
}

// A saved state is external input: a database returns whatever its row holds. A state counts from
// its `expiresAt` as no state, as in the memory store, because a database may delete it later.
function parseState(saved: unknown, now: number): State | undefined {
  if (typeof saved !== "object" || saved === null) return
  if (!("type" in saved && "expiresAt" in saved && isInteger(saved.expiresAt))) return
  if (saved.expiresAt <= now) return

  const { expiresAt } = saved

  switch (saved.type) {
    case "fixedWindow":
      return "window" in saved
        && isInteger(saved.window)
        && "count" in saved
        && isInteger(saved.count)
        ? { count: saved.count, expiresAt, type: "fixedWindow", window: saved.window }
        : undefined

    case "slidingWindow":
      return "window" in saved
        && isInteger(saved.window)
        && "current" in saved
        && isInteger(saved.current)
        && "previous" in saved
        && isInteger(saved.previous)
        ? {
            current: saved.current,
            expiresAt,
            previous: saved.previous,
            type: "slidingWindow",
            window: saved.window,
          }
        : undefined

    case "tokenBucket":
      return "tokens" in saved
        && isInteger(saved.tokens)
        && "refilledAt" in saved
        && isInteger(saved.refilledAt)
        ? { expiresAt, refilledAt: saved.refilledAt, tokens: saved.tokens, type: "tokenBucket" }
        : undefined

    default:
      return undefined
  }
}

function isInteger(value: unknown): value is number {
  return Number.isSafeInteger(value)
}
