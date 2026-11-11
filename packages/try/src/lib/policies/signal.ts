import { CancellationError } from "#lib/shared/errors.ts"
import { discardOutcome, resolveWithAbort } from "#lib/shared/utils.ts"

export class SignalController {
  /**
   * Aborts when an external signal or the deadline signal aborts.
   */
  readonly signal: AbortSignal
  /**
   * Cancellation detection reads only the external signals, never the composed execution signal:
   * `AbortSignal.any` latches the first abort reason, so a timeout firing first would otherwise
   * hide a later external cancellation from `checkDidCancel` for as long as execution keeps
   * running.
   */
  readonly #cancelSignal?: AbortSignal

  constructor(signals: readonly AbortSignal[] = [], timeoutSignal?: AbortSignal) {
    if (signals.length > 0) {
      this.#cancelSignal = AbortSignal.any([...signals])
    }

    const composedSignals = [this.#cancelSignal, timeoutSignal].filter(
      (value): value is AbortSignal => value !== undefined
    )

    // The execution creates a controller only when it has an external or a deadline signal.
    this.signal = AbortSignal.any(composedSignals)
  }

  checkDidCancel(cause?: unknown): CancellationError | undefined {
    // Every abort on the external signals is a cancellation, whatever its reason. A parent deadline
    // aborts with a TimeoutError, and this execution's own deadline never reaches this signal.
    if (!this.#cancelSignal?.aborted) {
      return
    }

    return new CancellationError(undefined, { cause: cause ?? this.#cancelSignal.reason })
  }

  race<V>(promise: PromiseLike<V>, cause?: unknown): PromiseLike<V | CancellationError> {
    const cancelled = this.checkDidCancel(cause)

    if (cancelled) {
      discardOutcome(promise)
      return Promise.resolve(cancelled)
    }

    return resolveWithAbort(
      this.signal,
      promise,
      () => new CancellationError(undefined, { cause: cause ?? this.signal.reason })
    )
  }
}
