import { defineDisposeAlias } from "#lib/disposal/index.ts"
import { Panic, TimeoutError } from "#lib/shared/errors.ts"
import { discardOutcome, invariant, resolveWithAbort, startTimer } from "#lib/shared/utils.ts"

/**
 * Single source of truth for timeout validation: used eagerly by the builder at `.timeout()` call
 * time and defensively by {@link TimeoutController}.
 */
export function assertValidTimeout(ms: number): void {
  invariant(Number.isFinite(ms), new Panic("TIMEOUT_INVALID_MS"))
  invariant(ms >= 0, new Panic("TIMEOUT_INVALID_MS"))
}

export class TimeoutController {
  readonly #controller = new AbortController()
  /**
   * Aborts with a {@link TimeoutError} when the deadline expires.
   */
  readonly signal: AbortSignal = this.#controller.signal
  /**
   * The deadline is measured on the monotonic clock, so a change to the system clock never moves
   * it.
   */
  readonly #startedAt = performance.now()
  readonly #timeoutMs: number
  #cancelTimer: (() => void) | undefined
  declare [Symbol.dispose]: () => void

  constructor(timeoutMs: number) {
    assertValidTimeout(timeoutMs)
    this.#timeoutMs = timeoutMs

    if (this.#timeoutMs <= 0) {
      this.#abort()
      return
    }

    this.#cancelTimer = startTimer(() => {
      this.#abort()
    }, this.#timeoutMs)
  }

  #abort(cause?: unknown) {
    const timeoutError = new TimeoutError(`Execution exceeded timeout of ${this.#timeoutMs}ms`, {
      cause,
    })

    // The timer can fire after a clock check already aborted the deadline.
    if (!this.signal.aborted) {
      this.#controller.abort(timeoutError)
    }

    return timeoutError
  }

  get #remaining() {
    const elapsed = performance.now() - this.#startedAt

    return this.#timeoutMs - elapsed
  }

  checkDidTimeout(cause?: unknown): TimeoutError | undefined {
    if (this.signal.aborted) {
      const reason = this.signal.reason

      if (reason instanceof TimeoutError) {
        return reason
      }

      return new TimeoutError(`Execution exceeded timeout of ${this.#timeoutMs}ms`, {
        cause: cause ?? reason,
      })
    }

    if (this.#remaining > 0) {
      return
    }

    return this.#abort(cause)
  }

  race<V>(promise: PromiseLike<V>, cause?: unknown): PromiseLike<V | TimeoutError> {
    const timedOut = this.checkDidTimeout(cause)

    if (timedOut) {
      discardOutcome(promise)
      return Promise.resolve(timedOut)
    }

    return resolveWithAbort(
      this.signal,
      promise,
      () =>
        this.checkDidTimeout(cause)
        ?? new TimeoutError(`Execution exceeded timeout of ${this.#timeoutMs}ms`, { cause })
    )
  }

  dispose(): void {
    this.#cancelTimer?.()
  }
}
defineDisposeAlias(TimeoutController.prototype)
