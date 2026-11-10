import type { BuilderConfig, BaseTryCtx } from "#lib/policies/options.ts"
import type { NonPromise } from "#lib/shared/utils.ts"
import { Panic, type PanicCode, type UnhandledException } from "#lib/shared/errors.ts"
import { checkIsPromiseLike, discardOutcome, invariant } from "#lib/shared/utils.ts"
import type { RunnerError } from "./base"
import { BaseExecution, RetryDirective } from "./base"

export type SyncRunTryFn<T, Ctx extends BaseTryCtx = BaseTryCtx> = (ctx: Ctx) => NonPromise<T>
export type SyncRunCatchFn<E> = (error: unknown) => NonPromise<E>

export interface SyncRunOptions<T, E, Ctx extends BaseTryCtx = BaseTryCtx> {
  try: SyncRunTryFn<T, Ctx>
  /**
   * Maps errors that originated inside `try` — thrown directly, or carried out of the retry loop as
   * the last attempt's error once the retry policy gives up. This call's own policy outcomes
   * (timeout, cancellation) and defects (`Panic`) never pass through `catch`: they are reported
   * directly, even when they fire while the handler is running.
   */
  catch: SyncRunCatchFn<E>
}

export type SyncRunInput<T, E, Ctx extends BaseTryCtx = BaseTryCtx> =
  | SyncRunTryFn<T, Ctx>
  | SyncRunOptions<T, E, Ctx>

function assertNotPromiseLike(value: unknown, code: PanicCode, message?: string): void {
  invariant(
    !checkIsPromiseLike(value),
    new Panic(code, message === undefined ? undefined : { message })
  )
}

class RunSyncExecution<T, E, Ctx extends BaseTryCtx> extends BaseExecution<T | E | RunnerError> {
  #catchFn: SyncRunCatchFn<E> | undefined
  #tryFn: SyncRunTryFn<T, Ctx>

  constructor(config: BuilderConfig, input: SyncRunInput<T, E, Ctx>) {
    super(config)

    this.#catchFn = typeof input === "function" ? undefined : input.catch
    this.#tryFn = typeof input === "function" ? input : input.try
  }

  // oxlint-disable-next-line class-methods-use-this -- polymorphic override
  protected override settleAsyncWrap(returned: PromiseLike<unknown>): T | E | RunnerError {
    discardOutcome(returned)
    throw new Panic("RUN_SYNC_WRAPPED_RESULT_PROMISE")
  }

  protected override executeCore(): T | E | RunnerError {
    return this.#runAttemptLoop()
  }

  #resolveFailure(error: unknown): E | RunnerError | RetryDirective {
    const resolved = this.resolveControlOrRetry(error)

    if (resolved) {
      return resolved
    }

    const catchFn = this.#catchFn

    if (!catchFn) {
      return this.resolveUnmappedFailure(error)
    }

    let mapped: E

    try {
      mapped = catchFn(error)
    } catch (catchError) {
      throw new Panic("CATCH_HANDLER_THROW", { cause: catchError })
    }

    assertNotPromiseLike(mapped, "RUN_SYNC_CATCH_PROMISE")

    // Control state can change while the catch handler runs, so arbitrate again
    // before returning a mapped sync value.
    return this.resolveOutcome(mapped, error)
  }

  #runAttemptLoop(): T | E | RunnerError {
    let currentAttempt = 1

    for (;;) {
      const controlBeforeAttempt = this.checkDidControlFail()

      if (controlBeforeAttempt) {
        return controlBeforeAttempt
      }

      this.startAttempt(currentAttempt)

      let result: NonPromise<T>

      try {
        result = this.#tryFn(this.ctx as unknown as Ctx)
      } catch (error) {
        const resolved = this.#resolveFailure(error)

        if (resolved instanceof RetryDirective) {
          if (resolved.delay > 0) {
            throw new Panic("RUN_SYNC_ASYNC_RETRY_POLICY")
          }

          currentAttempt += 1
          continue
        }

        return resolved
      }

      assertNotPromiseLike(result, "RUN_SYNC_TRY_PROMISE")

      return this.resolveOutcome(result)
    }
  }
}

export function executeRunSync<T, Ctx extends BaseTryCtx>(
  config: BuilderConfig,
  input: SyncRunTryFn<T, Ctx>
): T | UnhandledException | RunnerError
export function executeRunSync<T, E, Ctx extends BaseTryCtx>(
  config: BuilderConfig,
  input: SyncRunInput<T, E, Ctx>
): T | E | RunnerError
export function executeRunSync<T, E, Ctx extends BaseTryCtx>(
  config: BuilderConfig,
  input: SyncRunInput<T, E, Ctx>
): T | E | RunnerError {
  // Builder typing blocks async-only retry policies, but calling executeRunSync
  // directly and unsafe casts still need a runtime guard here.
  const isSyncSafeRetryPolicy =
    config.retry === undefined
    || (config.retry.backoff === "constant"
      && !config.retry.jitter
      && (config.retry.delayMs ?? 0) <= 0)

  invariant(isSyncSafeRetryPolicy, new Panic("RUN_SYNC_ASYNC_RETRY_POLICY"))

  using execution = new RunSyncExecution<T, E, Ctx>(config, input)
  return execution.execute()
}
