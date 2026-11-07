export abstract class Subscribable<TListener, TOptions> {
  protected readonly listeners = new Set<{
    readonly listener: TListener
    readonly options: TOptions
  }>()

  subscribe(listener: TListener, options: TOptions): () => void {
    const subscription = { listener, options }
    this.listeners.add(subscription)
    this.onSubscribe()

    return () => {
      const removed = this.listeners.delete(subscription)
      if (removed) {
        this.onUnsubscribe()
      }
    }
  }

  protected abstract onSubscribe(): void

  protected abstract onUnsubscribe(): void
}
