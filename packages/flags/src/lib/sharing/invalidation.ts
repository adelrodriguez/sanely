import type { Subject } from "#lib/identity/index.ts"
import { reportInBackground } from "#lib/shared/report.ts"
import { normalizeError } from "#lib/shared/utils.ts"
import type { Sharing } from "./config"

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
 * Adds the listener that invalidates this reader's decision memory to the change broadcaster: it
 * drops in-flight coalesced calls for the changed flags, asks a store with `deleteFlags` to delete
 * their decisions, and invalidates every pending cache write regardless of which flags changed.
 * Added on the first evaluation that touches cache or coalescing and never removed, so the provider
 * stays attached for the reader's lifetime. A throwing `subscribe` never fails the evaluation: it
 * is reported through `onError` and the evaluation continues without invalidation. The next
 * evaluation tries again.
 */
export function attachInvalidationSubscription<TIdentity extends Subject>(
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
    // Invalidate open write tickets for every store: a decision fetched before the change must
    // never be written after it.
    const { writes } = state
    writes.generation += 1
    // Only a store with `deleteFlags` can find a flag's stored decisions. Any other store keeps
    // them until it expires them.
    const remove = config.store?.deleteFlags?.bind(config.store)
    if (remove) {
      deleteFlags(config, remove, changedFlagKeys)
    }
  })
}
