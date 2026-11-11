import { defineDisposeAlias } from "#lib/disposal/index.ts"
import { TimeoutError } from "#lib/shared/errors.ts"
import { discardOutcome, resolveWithAbort, startTimer } from "#lib/shared/utils.ts"
import { milliseconds } from "./milliseconds.ts"

/**
 * Single source of truth for timeout validation: used eagerly by the builder at `.timeout()` call
 * time and defensively by {@link TimeoutController}. Reads a deadline in milliseconds or as a time
 * expression, and throws a `Panic` with the code `TIMEOUT_INVALID_MS` for an invalid one.
 */
export function parseTimeout(timeout: number | string): number {
  return milliseconds(timeout, "TIMEOUT_INVALID_MS")
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
  readonly #timeout: number
  #cancelTimer: (() => void) | undefined
  declare [Symbol.dispose]: () => void

  /**
   * @param timeout - The deadline in milliseconds.
   */
  constructor(timeout: number) {
    this.#timeout = parseTimeout(timeout)

    if (this.#timeout <= 0) {
      this.#abort()
      return
    }

    this.#cancelTimer = startTimer(() => {
      this.#abort()
    }, this.#timeout)
  }

  #abort(cause?: unknown) {
    const timeoutError = new TimeoutError(`Execution exceeded timeout of ${this.#timeout}ms`, {
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

    return this.#timeout - elapsed
  }

  checkDidTimeout(cause?: unknown): TimeoutError | undefined {
    if (this.signal.aborted) {
      const reason = this.signal.reason

      if (reason instanceof TimeoutError) {
        return reason
      }

      return new TimeoutError(`Execution exceeded timeout of ${this.#timeout}ms`, {
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
        ?? new TimeoutError(`Execution exceeded timeout of ${this.#timeout}ms`, { cause })
    )
  }

  dispose(): void {
    this.#cancelTimer?.()
  }
}
defineDisposeAlias(TimeoutController.prototype)
