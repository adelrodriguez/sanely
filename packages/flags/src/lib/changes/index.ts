/**
 * Receives the changed flag keys. No keys means that any flag may have changed.
 */
export type ChangeListener = (keys?: readonly string[]) => void

/**
 * Sends one reader's provider change notifications to every listener. It attaches the provider's
 * `subscribe` at most once at a time: on the first listener, and it detaches when the last listener
 * leaves. Listeners run synchronously, in subscription order.
 *
 * A listener stays registered when the provider's `subscribe` throws. The broadcaster reports the
 * error and stays detached, and the next `subscribe` or `attach` tries again, so listeners that
 * joined during a failed attach receive the changes after a later attach succeeds.
 */
export type ChangeBroadcaster = {
  /**
   * Adds a listener, attaches the provider when needed, and returns an idempotent unsubscribe
   * function. It never throws.
   */
  subscribe(listener: ChangeListener): () => void
  /**
   * Attaches the provider again when listeners wait and an earlier attach failed.
   */
  attach(): void
  /**
   * Removes every listener and detaches the provider. Later subscriptions attach it again.
   */
  close(): void
}

export function createChangeBroadcaster(
  subscribe: (notify: ChangeListener) => () => void,
  onAttachError: (error: unknown) => void
): ChangeBroadcaster {
  // One entry per subscription, so one function subscribed twice needs two unsubscribes.
  const listeners = new Set<{ listener: ChangeListener }>()
  let attached = false
  let detach: (() => void) | undefined

  const notify: ChangeListener = (keys) => {
    // A JavaScript provider can send any value. An array keeps its string keys, and anything else
    // means that any flag may have changed, so no listener misses a change.
    const changed: readonly string[] | undefined = Array.isArray(keys)
      ? keys.filter((key): key is string => typeof key === "string")
      : undefined
    // Snapshot: a listener added during this notification does not receive it.
    for (const entry of Array.from(listeners)) {
      entry.listener(changed)
    }
  }

  const attach = () => {
    if (attached || listeners.size === 0) {
      return
    }
    // Set before the call: a listener that subscribes again during a synchronous notification
    // must not attach a second time.
    attached = true
    try {
      detach = subscribe(notify)
    } catch (error) {
      attached = false
      onAttachError(error)
    }
  }

  return {
    attach,
    close() {
      listeners.clear()
      if (attached) {
        const detachProvider = detach
        attached = false
        detach = undefined
        detachProvider?.()
      }
    },
    subscribe(listener) {
      const entry = { listener }
      listeners.add(entry)
      attach()

      let subscribed = true
      return () => {
        if (!subscribed) {
          return
        }
        subscribed = false
        listeners.delete(entry)
        if (listeners.size === 0 && attached) {
          const detachProvider = detach
          attached = false
          detach = undefined
          detachProvider?.()
        }
      }
    },
  }
}
