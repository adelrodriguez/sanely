/**
 * Receives the changed flag keys. No keys means that any flag may have changed.
 */
export type ChangeListener = (keys?: readonly string[]) => void

/**
 * Sends one reader's provider change notifications to every listener. It attaches the provider's
 * `subscribe` at most once at a time: on the first listener, and it detaches when the last listener
 * leaves. Listeners run synchronously, in subscription order.
 */
export type ChangeBroadcaster = {
  /**
   * Adds a listener and returns an idempotent unsubscribe function. When this listener causes the
   * attach and the provider's `subscribe` throws, the broadcaster stays detached and rethrows. The
   * next listener tries again.
   */
  subscribe(listener: ChangeListener): () => void
}

export function createChangeBroadcaster(
  subscribe: (notify: ChangeListener) => () => void
): ChangeBroadcaster {
  // One entry per subscription, so one function subscribed twice needs two unsubscribes.
  const listeners = new Set<{ listener: ChangeListener }>()
  let attached = false
  let detach: (() => void) | undefined

  const notify: ChangeListener = (keys) => {
    // Snapshot: a listener added during this notification does not receive it.
    for (const entry of Array.from(listeners)) {
      entry.listener(keys)
    }
  }

  return {
    subscribe(listener) {
      const entry = { listener }
      listeners.add(entry)

      if (!attached) {
        // Set before the call: a listener that subscribes again during a synchronous notification
        // must not attach a second time.
        attached = true
        try {
          detach = subscribe(notify)
        } catch (error) {
          attached = false
          listeners.delete(entry)
          throw error
        }
      }

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
