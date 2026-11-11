import type { TimeExpression, ValidateTimeExpression } from "@sanely/duration"
import type { FlowResult, FlowValue, InferredFlowTaskContext } from "#lib/orchestration/flow.ts"
import type {
  InferredTaskContext,
  TaskRecord,
  TaskResult,
  TaskValidation,
  AllSettledResult,
  AllValue,
  CatchOptions,
} from "#lib/orchestration/task-graph.ts"
import type {
  BuilderConfig,
  RetryOptions,
  RetryPolicy,
  TryCtxFor,
  ValidateRetryLimit,
  ValidateRetryOptions,
  WrapFn,
} from "#lib/policies/options.ts"
import type {
  CancellationError,
  RetryExhaustedError,
  TimeoutError,
  UnhandledException,
} from "#lib/shared/errors.ts"
import { executeRunSync, type SyncRunInput, type SyncRunTryFn } from "#lib/execution/run-sync.ts"
import { executeRun, type AsyncRunInput, type RunTryFn } from "#lib/execution/run.ts"
import { orchestrate } from "#lib/orchestration/orchestrate.ts"
import { retryOptions, type SyncRetryOptions } from "#lib/policies/retry.ts"
import { parseTimeout } from "#lib/policies/timeout.ts"

type ConfigRunErrors = TimeoutError | CancellationError
/**
 * The failure type for try functions without a catch handler. With retry configured, any give-up
 * (limit exhausted or `shouldRetry` declining) is reported as {@link RetryExhaustedError} carrying
 * the last attempt's error as `cause`; otherwise failures are wrapped in {@link UnhandledException}.
 */
type UnmappedError<HasRetry extends boolean> = HasRetry extends true
  ? RetryExhaustedError
  : UnhandledException
type OrchestrationMethods = "all" | "allSettled" | "flow"
type AsyncPolicyHiddenMethods<SupportsOrchestration extends boolean> =
  | "runSync"
  | "wrap"
  | (SupportsOrchestration extends true ? never : OrchestrationMethods)
type ExecutionBuilderSurface<E extends ConfigRunErrors, HasRetry extends boolean> = Omit<
  RunBuilder<E, HasRetry, false>,
  OrchestrationMethods | "wrap"
>
/**
 * Surface after an async policy (`timeout`/`signal`): sync execution and further wraps are gone,
 * orchestration stays available unless retry already removed it.
 */
type AsyncPolicyBuilderSurface<
  E extends ConfigRunErrors,
  HasRetry extends boolean,
  SupportsOrchestration extends boolean,
> = Omit<
  RunBuilder<E, HasRetry, SupportsOrchestration>,
  AsyncPolicyHiddenMethods<SupportsOrchestration>
>
type AsyncExecutionBuilderSurface<
  E extends ConfigRunErrors,
  HasRetry extends boolean,
> = AsyncPolicyBuilderSurface<E, HasRetry, false>
/**
 * Surface after `retry`. `runSync` stays available only when the policy never waits and no earlier
 * `timeout` or `signal` can interrupt the work. Those builders add their failure to `E`, so an
 * empty `E` means that neither is in the chain.
 */
type RetryBuilderSurface<E extends ConfigRunErrors, IsSyncPolicy extends boolean> = [E] extends [
  never,
]
  ? IsSyncPolicy extends true
    ? ExecutionBuilderSurface<E, true>
    : AsyncExecutionBuilderSurface<E, true>
  : AsyncExecutionBuilderSurface<E, true>

export class RunBuilder<
  E extends ConfigRunErrors = never,
  HasRetry extends boolean = false,
  SupportsOrchestration extends boolean = true,
> {
  protected readonly config: BuilderConfig

  constructor(config: BuilderConfig = {}) {
    this.config = config
  }

  protected buildTimeoutConfig(value: number | string): BuilderConfig {
    const timeout = parseTimeout(value)

    // Deadlines combine the way signals do: each one can only make the call stop sooner.
    return {
      ...this.config,
      timeout: Math.min(this.config.timeout ?? timeout, timeout),
    }
  }

  protected buildSignalConfig(signal: AbortSignal): BuilderConfig {
    return {
      ...this.config,
      signals: [...(this.config.signals ?? []), signal],
    }
  }

  // Runtime note: there is a single builder class. The one policy the type
  // surface forbids that would also be wrong at runtime — orchestration after
  // retry() from untyped code — is guarded at execution time by
  // OrchestrationExecution's ORCHESTRATION_UNSUPPORTED_POLICY panic. Wrap
  // ordering is behavior-invariant (wraps always cover the full retry scope),
  // so no runtime method-hiding is needed.

  retry<N extends number>(
    policy:
      | (N & ValidateRetryLimit<N>)
      | (Exclude<SyncRetryOptions, number> & { limit: N & ValidateRetryLimit<N> })
  ): RetryBuilderSurface<E, true>
  retry<N extends number, const T extends string = never>(
    policy: RetryPolicy<T> & { limit: N & ValidateRetryLimit<N> }
  ): RetryBuilderSurface<E, false>
  retry<const P extends RetryOptions<TimeExpression>>(
    policy: P & ValidateRetryOptions<P>
  ): RetryBuilderSurface<E, [P] extends [SyncRetryOptions] ? true : false>
  retry(policy: RetryOptions<TimeExpression>): ExecutionBuilderSurface<E, true> {
    return new RunBuilder<E, true, false>({
      ...this.config,
      retry: retryOptions(policy),
    })
  }

  /**
   * Applies one total deadline to the next terminal call. The deadline is milliseconds or a time
   * expression such as `"5s"`. When the chain already has a deadline, the tighter one applies. For
   * `run`, the deadline spans attempts, delays, and catch handling, and surfaces typed as
   * {@link TimeoutError}. For orchestration (`all`/`allSettled`/`flow`), it is a whole-graph
   * deadline: the task signal aborts when it fires and the orchestration resolves with
   * {@link TimeoutError} (cancellation still wins when both fire). The deadline is cooperative:
   * orchestration waits for in-flight tasks to settle before it resolves, so tasks must observe
   * `$signal` for it to bound wall-clock time.
   */
  timeout<const T extends string = never>(
    timeout: number | ValidateTimeExpression<T>
  ): AsyncPolicyBuilderSurface<E | TimeoutError, HasRetry, SupportsOrchestration> {
    return new RunBuilder(this.buildTimeoutConfig(timeout)) as unknown as AsyncPolicyBuilderSurface<
      E | TimeoutError,
      HasRetry,
      SupportsOrchestration
    >
  }

  signal(
    signal: AbortSignal
  ): AsyncPolicyBuilderSurface<E | CancellationError, HasRetry, SupportsOrchestration> {
    return new RunBuilder(this.buildSignalConfig(signal)) as unknown as AsyncPolicyBuilderSurface<
      E | CancellationError,
      HasRetry,
      SupportsOrchestration
    >
  }

  wrap(fn: WrapFn): RunBuilder<E, HasRetry, SupportsOrchestration> {
    return new RunBuilder({
      ...this.config,
      wraps: [...(this.config.wraps ?? []), fn],
    })
  }

  /**
   * Executes an async unit of work.
   *
   * `catch` maps errors that originated inside `try` — thrown directly, or carried out of the retry
   * loop as the last attempt's error once the retry policy gives up. This call's own policy
   * outcomes ({@link TimeoutError}, {@link CancellationError}) and defects (`Panic`) never pass
   * through `catch`; they surface typed in the return union (or are thrown, for `Panic`). A policy
   * failure that `try` rethrows from a nested call is an ordinary failure.
   *
   * Without `catch`, unmapped failures are wrapped: {@link RetryExhaustedError} when a retry policy
   * gave up, {@link UnhandledException} otherwise. The original error is available as `cause`.
   */
  run<T>(tryFn: RunTryFn<T, TryCtxFor<HasRetry>>): Promise<Awaited<T> | UnmappedError<HasRetry> | E>
  run<T, C>(options: AsyncRunInput<T, C, TryCtxFor<HasRetry>>): Promise<Awaited<T> | Awaited<C> | E>
  run<T, C>(input: AsyncRunInput<T, C, TryCtxFor<HasRetry>>) {
    return executeRun(this.config, input)
  }

  /**
   * Executes a sync unit of work.
   *
   * Follows the same `catch` contract as {@link RunBuilder.run}: `catch` maps try-originated errors
   * (including retry give-up); policy outcomes and defects never pass through it.
   */
  runSync<T>(tryFn: SyncRunTryFn<T, TryCtxFor<HasRetry>>): T | UnmappedError<HasRetry> | E
  runSync<T, C>(input: SyncRunInput<T, C, TryCtxFor<HasRetry>>): T | C | E
  runSync<T, C>(input: SyncRunInput<T, C, TryCtxFor<HasRetry>>) {
    return executeRunSync(this.config, input)
  }

  /**
   * Runs a task graph and resolves with every task result. Like `run`, it never rejects except with
   * a `Panic`. Without `catch`, a task failure resolves as {@link UnhandledException} with the
   * failure as `cause`. This call's own policy outcomes surface typed in the result union.
   */
  all<T extends TaskRecord>(
    tasks: T & TaskValidation<NoInfer<T>> & ThisType<InferredTaskContext<T>>
  ): Promise<{ [K in keyof T]: TaskResult<T[K]> } | UnhandledException | E>
  all<T extends TaskRecord, C>(
    tasks: T & TaskValidation<NoInfer<T>> & ThisType<InferredTaskContext<T>>,
    options: CatchOptions<AllValue<T>, C>
  ): Promise<{ [K in keyof T]: TaskResult<T[K]> } | C | E>
  all<T extends TaskRecord, C>(
    tasks: T & TaskValidation<NoInfer<T>> & ThisType<InferredTaskContext<T>>,
    options?: CatchOptions<AllValue<T>, C>
  ) {
    return orchestrate(this.config, "all", tasks, options)
  }

  /**
   * Runs a task graph and resolves with every settled outcome. It never rejects except with a
   * `Panic`, and this call's own policy outcomes surface typed in the result union.
   */
  allSettled<T extends TaskRecord>(
    tasks: T & TaskValidation<NoInfer<T>> & ThisType<InferredTaskContext<T>>
  ): Promise<AllSettledResult<T> | E>
  allSettled<T extends TaskRecord>(
    tasks: T & TaskValidation<NoInfer<T>> & ThisType<InferredTaskContext<T>>
  ) {
    return orchestrate(this.config, "allSettled", tasks)
  }

  /**
   * Runs a task graph until a task calls `$exit`, and resolves with the exit value. Like `run`, it
   * never rejects except with a `Panic`. Without `catch`, a task failure resolves as
   * {@link UnhandledException} with the failure as `cause`. This call's own policy outcomes surface
   * typed in the result union.
   */
  flow<T extends TaskRecord>(
    tasks: T & TaskValidation<NoInfer<T>> & ThisType<InferredFlowTaskContext<T>>
  ): Promise<FlowResult<T> | UnhandledException | E>
  flow<T extends TaskRecord, C>(
    tasks: T & TaskValidation<NoInfer<T>> & ThisType<InferredFlowTaskContext<T>>,
    options: CatchOptions<FlowValue<T>, C>
  ): Promise<FlowResult<T> | C | E>
  flow<T extends TaskRecord, C>(
    tasks: T & TaskValidation<NoInfer<T>> & ThisType<InferredFlowTaskContext<T>>,
    options?: CatchOptions<FlowValue<T>, C>
  ) {
    return orchestrate(this.config, "flow", tasks, options)
  }
}
