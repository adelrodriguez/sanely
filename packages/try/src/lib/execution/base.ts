import type { BuilderConfig, TryCtx } from "#lib/policies/options.ts"
import { defineDisposeAlias } from "#lib/disposal/index.ts"
import { calculateRetryDelay, checkShouldAttemptRetry } from "#lib/policies/retry.ts"
import { SignalController } from "#lib/policies/signal.ts"
import { TimeoutController } from "#lib/policies/timeout.ts"
import {
  CancellationError,
  ControlError,
  Panic,
  RetryExhaustedError,
  TimeoutError,
  UnhandledException,
} from "#lib/shared/errors.ts"

export type RunnerError =
  | CancellationError
  | RetryExhaustedError
  | TimeoutError
  | UnhandledException

export class RetryDirective {
  readonly delay: number

  constructor(delay: number) {
    this.delay = delay
  }
}

export abstract class BaseExecution<TResult = unknown> implements Disposable {
  protected readonly config: BuilderConfig
  /**
   * The read-only view of the execution context that user code receives.
   */
  protected readonly ctx: TryCtx
  protected readonly executionSignal: AbortSignal | undefined
  readonly #retryState: { attempt: number; readonly limit: number }
  readonly #signalController: SignalController | undefined
  readonly #timeoutController: TimeoutController | undefined
  declare [Symbol.dispose]: () => void

  protected constructor(config: BuilderConfig) {
    this.config = config
    this.#timeoutController = BaseExecution.createTimeoutController(config.timeout)
    this.#signalController = BaseExecution.createSignalController(
      config.signals,
      this.#timeoutController?.signal
    )
    this.executionSignal = this.#signalController?.signal
    this.#retryState = { attempt: 1, limit: config.retry?.limit ?? 1 }
    this.ctx = BaseExecution.createContext(this.#retryState, this.executionSignal)
  }

  execute(): TResult {
    // Wraps cover the full retry scope; `ctx.retry.attempt` may reflect the final
    // attempt when observed after `next()` resolves.
    const wraps = this.config.wraps

    if (!wraps || wraps.length === 0) {
      return this.executeCore()
    }

    let next = (): unknown => this.executeCore()

    for (const wrap of wraps.toReversed()) {
      const previous = next
      next = () => wrap(this.ctx, previous)
    }

    return next() as TResult
  }

  protected abstract executeCore(): TResult

  dispose(): void {
    this.#timeoutController?.dispose()
  }

  /**
   * Records the attempt that is about to run. Only the execution writes the attempt count.
   */
  protected startAttempt(attempt: number): void {
    this.#retryState.attempt = attempt
  }

  protected static createTimeoutController(
    timeoutMs: number | undefined
  ): TimeoutController | undefined {
    return timeoutMs === undefined ? undefined : new TimeoutController(timeoutMs)
  }

  protected static createSignalController(
    signals: readonly AbortSignal[] | undefined,
    timeoutSignal: AbortSignal | undefined
  ): SignalController | undefined {
    const userSignals = signals ?? []

    return userSignals.length > 0 || timeoutSignal !== undefined
      ? new SignalController(userSignals, timeoutSignal)
      : undefined
  }

  protected static createContext(
    retryState: TryCtx["retry"],
    signal: AbortSignal | undefined
  ): TryCtx {
    // `ctx.retry.attempt` advances across retries, so the retry view must stay live
    // while still reporting read-only data descriptors; a Proxy is the only way to
    // do both. `ctx.signal` is set once at construction, so a frozen plain object
    // suffices for the rest.
    const retry = new Proxy(retryState, {
      defineProperty: () => false,
      deleteProperty: () => false,
      getOwnPropertyDescriptor(target, property) {
        const descriptor = Reflect.getOwnPropertyDescriptor(target, property)

        if (!descriptor) {
          return descriptor
        }

        return {
          ...descriptor,
          writable: false,
        }
      },
      set: () => false,
    })

    return Object.freeze({ retry, signal })
  }

  protected checkDidCancel(cause?: unknown): CancellationError | undefined {
    return this.#signalController?.checkDidCancel(cause)
  }

  protected raceWithCancellation<V>(
    promise: PromiseLike<V>,
    cause?: unknown
  ): PromiseLike<V | CancellationError> {
    return this.#signalController ? this.#signalController.race(promise, cause) : promise
  }

  /**
   * Observes current control state: cancellation is consulted before timeout, making this the
   * single statement of the cancellation-beats-timeout ordering. `cause` threads the underlying
   * error into whichever control error is created.
   */
  protected checkDidControlFail(cause?: unknown): CancellationError | TimeoutError | undefined {
    return this.checkDidCancel(cause) ?? this.#timeoutController?.checkDidTimeout(cause)
  }

  /**
   * Single owner of the outcome-priority rule: cancellation beats timeout beats the candidate
   * outcome. Callers invoke this at every boundary where control state may have changed since the
   * candidate was produced; `cause` threads the underlying error into whichever control error is
   * reported. A race-produced `TimeoutError` candidate survives the timeout check unchanged — the
   * chain returns the controller's stored reason, which is that same instance.
   */
  protected resolveOutcome<V>(candidate: V, cause?: unknown): V | CancellationError | TimeoutError {
    return this.checkDidControlFail(cause) ?? candidate
  }

  protected race<V>(
    promise: PromiseLike<V>,
    cause?: unknown
  ): PromiseLike<V | CancellationError | TimeoutError> {
    const timeoutController = this.#timeoutController

    if (!timeoutController) {
      return this.raceWithCancellation(promise, cause)
    }

    // Nest cancellation inside the timeout race so cancellation takes priority
    // when both fire: if cancellation wins, the inner promise already resolves
    // with a CancellationError. Every other outcome is still provisional: the
    // deadline timer can run late, so a value can settle after the deadline has
    // passed. Route it through resolveOutcome, which checks the clock the same
    // way the sync branch does, and lets a near-simultaneous cancel win.
    return Promise.resolve(
      timeoutController.race(this.raceWithCancellation(promise, cause), cause)
    ).then((raced) => this.resolveOutcome(raced, cause))
  }

  protected async waitForRetryDelay(
    delay: number
  ): Promise<CancellationError | TimeoutError | undefined> {
    if (delay <= 0) {
      return undefined
    }

    const { promise: delayElapsed, resolve } = Promise.withResolvers()
    const timer = setTimeout(resolve, delay)

    try {
      const delayResult = await this.race(delayElapsed)

      if (delayResult instanceof CancellationError || delayResult instanceof TimeoutError) {
        return delayResult
      }

      return undefined
    } finally {
      // A timeout or cancellation can end the wait before the timer fires. Clear the timer so it
      // does not keep the process alive after the execution returns.
      clearTimeout(timer)
    }
  }

  /**
   * Shared prefix of attempt-failure resolution: rethrows defects, passes control errors through,
   * and turns retryable failures into a {@link RetryDirective}. Returns `undefined` when the failure
   * should continue into catch mapping (or unmapped wrapping).
   */
  protected resolveControlOrRetry(error: unknown): RunnerError | RetryDirective | undefined {
    if (error instanceof Panic) {
      throw error
    }

    if (error instanceof ControlError) {
      return error
    }

    const controlError = this.checkDidControlFail(error)

    if (controlError) {
      return controlError
    }

    if (checkShouldAttemptRetry(error, this.ctx, this.config)) {
      return new RetryDirective(calculateRetryDelay(this.ctx.retry.attempt, this.config))
    }

    return undefined
  }

  /**
   * Shared tail of attempt-failure resolution when no catch handler exists. With retry configured,
   * any give-up (limit exhausted or shouldRetry declining) is reported uniformly as
   * {@link RetryExhaustedError} carrying the last attempt's error; otherwise the failure is wrapped
   * in {@link UnhandledException}.
   */
  protected resolveUnmappedFailure(error: unknown): RunnerError {
    // Even without a catch handler, cancellation/timeout may have won since
    // the original failure was first observed, so the wrapped error is only a
    // candidate outcome.
    const wrapped = this.config.retry
      ? new RetryExhaustedError(undefined, { cause: error })
      : new UnhandledException(undefined, { cause: error })

    return this.resolveOutcome(wrapped, error)
  }
}
defineDisposeAlias(BaseExecution.prototype)
