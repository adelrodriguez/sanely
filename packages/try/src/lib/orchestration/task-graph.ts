import type { AsyncDisposer } from "#lib/disposal/index.ts"
import type { BuilderConfig } from "#lib/policies/options.ts"
import { disposer, defineAsyncDisposeAlias } from "#lib/disposal/index.ts"
import { BaseExecution } from "#lib/execution/base.ts"
import {
  type CancellationError,
  Panic,
  type TimeoutError,
  UnhandledException,
  isPanic,
} from "#lib/shared/errors.ts"
import { checkIsPromiseLike, invariant, resolveWithAbort } from "#lib/shared/utils.ts"

const TASK_RACE_ABORTED = Symbol("taskRaceAborted")

/**
 * Records a task result as an own property. Plain assignment would call the `__proto__` setter for
 * a task with that name and lose the result.
 */
function setTaskResult(target: Record<string, unknown>, taskName: string, value: unknown): void {
  Object.defineProperty(target, taskName, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  })
}

// oxlint-disable-next-line no-explicit-any -- Required for task-map inference
export type TaskRecord = Record<string, any>

export type TaskValidation<T extends TaskRecord> = {
  // oxlint-disable-next-line no-explicit-any -- Required for function compatibility with contextual `this`
  [K in keyof T]: T[K] extends (...args: any[]) => any ? T[K] : never
}

// oxlint-disable-next-line no-explicit-any -- Required for function compatibility with contextual `this`
export type TaskResult<T> = T extends (...args: any[]) => infer R ? Awaited<R> : never

export type ResultProxy<T extends TaskRecord> = {
  readonly [K in keyof T]: Promise<TaskResult<T[K]>>
}

export interface TaskContext<T extends TaskRecord> {
  readonly $result: ResultProxy<T>
  readonly $signal: AbortSignal
  readonly $disposer: AsyncDisposer
  /**
   * Races a promise against `$signal`, rejecting with the abort reason if the signal fires first.
   * Wrap awaits on signal-unaware work so graph deadlines and cancellation bound wall-clock time.
   */
  readonly $race: <V>(promise: PromiseLike<V>) => Promise<V>
}

export type InferredTaskContext<T extends TaskRecord> = {
  readonly $result: {
    readonly [K in keyof T]: ReturnType<T[K]> extends Promise<infer R>
      ? Promise<R>
      : Promise<ReturnType<T[K]>>
  }
  readonly $signal: AbortSignal
  readonly $disposer: AsyncDisposer
  readonly $race: <V>(promise: PromiseLike<V>) => Promise<V>
}

export type AllValue<T extends TaskRecord> = {
  [K in keyof T]: TaskResult<T[K]>
}

/**
 * What an orchestration `catch` receives about the task graph. `V` maps each task to the value it
 * resolves with.
 */
export interface CatchContext<V> {
  /**
   * The task whose failure `catch` receives, or `undefined`.
   */
  readonly failedTask: (keyof V & string) | undefined
  /**
   * Reads the result of a task that resolved before the failure, or `undefined`. The results are a
   * snapshot from when `catch` started.
   *
   * It is a generic accessor, not an object of results, so that TypeScript can infer the task
   * results and the `catch` value together. An object typed by every task result makes that
   * inference circular when a task returns a value read through `this`.
   *
   * Reading a task that itself returns a value read through `this` is still circular, and
   * TypeScript infers that task as `any`. Annotate the return type of such a task, such as `async
   * total(): Promise<number>`, when `catch` reads it.
   */
  readonly result: <K extends keyof V & string>(task: K) => V[K] | undefined
  /**
   * The task signal, already aborted by the failure.
   */
  readonly signal: AbortSignal
}

export interface CatchOptions<V, C> {
  catch: (error: unknown, ctx: CatchContext<V>) => C | Promise<C>
}

/**
 * A task graph that can describe itself to a `catch` handler.
 */
interface CatchableTaskGraph {
  readonly panic: Panic | undefined
  createCatchContext(): CatchContext<Record<string, unknown>>
}

export interface SettledFulfilled<T> {
  status: "fulfilled"
  value: T
}

export interface SettledRejected {
  status: "rejected"
  reason: unknown
}

export type SettledResult<T> = SettledFulfilled<T> | SettledRejected

export type AllSettledResult<T extends TaskRecord> = {
  [K in keyof T]: SettledResult<TaskResult<T[K]>>
}

interface TaskGraphRun<R> extends AsyncDisposable {
  readonly panic: Panic | undefined
  execute(): Promise<R>
  waitForTasksToSettle(): Promise<void>
}

/**
 * The outcome of a task graph before control state and Panics are applied.
 */
export type TaskGraphOutcome<R> = { mapped: R } | { thrown: unknown } | { panic: Panic }

interface TaskGraphOptions<R> {
  mapFailure?: (error: unknown) => TaskGraphOutcome<R> | Promise<TaskGraphOutcome<R>>
}

export type ControlFailure = CancellationError | TimeoutError

export abstract class OrchestrationExecution<TResult> extends BaseExecution<
  Promise<TResult | ControlFailure>
> {
  protected constructor(config: BuilderConfig) {
    invariant(
      config.retry === undefined,
      new Panic("ORCHESTRATION_UNSUPPORTED_POLICY", {
        message: "Orchestration does not support retry policies.",
      })
    )

    super(config)
  }

  protected override async executeCore(): Promise<TResult | ControlFailure> {
    // Orchestration executions still share outer wraps/cancellation checks even
    // though their task execution strategies differ.
    const controlBeforeExecution = this.checkDidControlFail()

    if (controlBeforeExecution) {
      return controlBeforeExecution
    }

    return await this.executeTasks()
  }

  /**
   * Shared task-graph lifecycle: race execution against cancellation and the graph deadline, let
   * `mapFailure` turn a failure into a mapped result, wait for in-flight tasks to settle before
   * resolving (so no task code is still running once the orchestration returns), and report the
   * outcome as a value, the same way `run()` does:
   *
   * - A Panic throws, and wins over everything else.
   * - This call's own cancellation, then its deadline, win over the result or the failure.
   * - A mapped result is returned as is.
   * - An unmapped task failure becomes an {@link UnhandledException} with the failure as `cause`.
   */
  protected async executeTaskGraph<R>(
    graph: TaskGraphRun<R>,
    options: TaskGraphOptions<R> = {}
  ): Promise<R | UnhandledException | ControlFailure> {
    await using execution = graph
    const { mapFailure = (error): TaskGraphOutcome<R> => ({ thrown: error }) } = options
    let outcome: TaskGraphOutcome<R>

    try {
      outcome = { mapped: (await this.race(execution.execute())) as R }
    } catch (error) {
      outcome = await mapFailure(error)
    } finally {
      await execution.waitForTasksToSettle()
    }

    // A Panic is programmer misuse, so it overrides any result or failure, as in run(): even one
    // that settled after catch mapped an earlier failure, or after cancellation or the deadline.
    if (execution.panic) {
      throw execution.panic
    }

    // A catch handler that throws or rejects is misuse too, so its Panic also wins over this call's
    // own cancellation or deadline, even one that the handler itself triggered.
    if ("panic" in outcome) {
      throw outcome.panic
    }

    // Control state may have changed while tasks ran or settled, and it takes priority over the
    // outcome; the shared chain reports cancellation over the graph deadline when both fired.
    const controlError = this.checkDidControlFail("thrown" in outcome ? outcome.thrown : undefined)

    if (controlError) {
      return controlError
    }

    if ("mapped" in outcome) {
      return outcome.mapped
    }

    // A Panic from the graph itself, such as FLOW_NO_EXIT, comes after control state: a deadline
    // or cancellation that stopped every task also explains why no task exited.
    if (isPanic(outcome.thrown)) {
      throw outcome.thrown
    }

    return new UnhandledException(undefined, { cause: outcome.thrown })
  }

  /**
   * Maps a task failure through an orchestration `catch`, with the same rules as `run()`: this
   * call's own policy failures and Panics never reach `catch`, and a `catch` that throws or rejects
   * reports a Panic.
   */
  protected async mapCatch<V, C>(
    catchFn: CatchOptions<V, C>["catch"] | undefined,
    graph: CatchableTaskGraph,
    error: unknown
  ): Promise<TaskGraphOutcome<C>> {
    const controlAfterFailure = this.checkDidControlFail(error)

    if (controlAfterFailure) {
      return { thrown: controlAfterFailure }
    }

    // Defects never pass through catch, the same as in run(). A task Panic is recorded on the graph,
    // and a Panic from the graph itself, such as FLOW_NO_EXIT, arrives as `error`.
    if (!catchFn || graph.panic || isPanic(error)) {
      return { thrown: error }
    }

    // The graph records task results without their types; `V` names them.
    const context = graph.createCatchContext() as CatchContext<V>

    try {
      const mapped = catchFn(error, context)

      if (!checkIsPromiseLike(mapped)) {
        return { mapped }
      }

      try {
        const raced = (await this.raceWithCancellation(
          Promise.resolve(mapped).catch((catchError: unknown) => {
            throw new Panic("CATCH_HANDLER_REJECT", { cause: catchError })
          }),
          error
        )) as C

        return { mapped: raced }
      } catch (mappedError) {
        return isPanic(mappedError) ? { panic: mappedError } : { thrown: mappedError }
      }
    } catch (catchError) {
      return { panic: new Panic("CATCH_HANDLER_THROW", { cause: catchError }) }
    }
  }

  protected abstract executeTasks(): Promise<TResult | UnhandledException | ControlFailure>
}

export abstract class TaskGraphExecutionBase<
  T extends TaskRecord,
  TContext extends TaskContext<T>,
> implements AsyncDisposable {
  protected readonly tasks: T
  protected readonly taskNames: Array<keyof T & string>
  readonly #settlements = new Map<keyof T, PromiseWithResolvers<unknown>>()
  protected readonly internalController: AbortController = new AbortController()
  protected readonly taskSignal: AbortSignal
  protected readonly disposer: AsyncDisposer = disposer()
  /**
   * The first task failure as the task threw it, and the task that threw it.
   */
  protected firstFailure: { error: unknown; taskName: (keyof T & string) | undefined } | undefined
  readonly #results: Record<string, unknown> = {}
  #panic: Panic | undefined
  declare [Symbol.asyncDispose]: () => Promise<void>

  constructor(signal: AbortSignal | undefined, tasks: T) {
    this.tasks = tasks
    this.taskNames = Object.keys(tasks)
    this.taskSignal = signal
      ? AbortSignal.any([signal, this.internalController.signal])
      : this.internalController.signal
  }

  get panic(): Panic | undefined {
    return this.#panic
  }

  /**
   * The results of the tasks that resolved so far, by task name.
   */
  protected get results(): Record<string, unknown> {
    return this.#results
  }

  createCatchContext(): CatchContext<Record<string, unknown>> {
    // Siblings keep settling while an async catch runs, so read from a snapshot.
    const snapshot = { ...this.#results }

    return Object.freeze({
      failedTask: this.firstFailure?.taskName,
      result: (task: string) => (Object.hasOwn(snapshot, task) ? snapshot[task] : undefined),
      signal: this.taskSignal,
    })
  }

  async dispose(): Promise<void> {
    await this.disposer.dispose()
  }

  protected getTaskHandler(taskName: keyof T) {
    const taskFn = this.tasks[taskName]

    invariant(
      typeof taskFn === "function",
      new Panic("TASK_INVALID_HANDLER", {
        message: `Task "${String(taskName)}" is not a function`,
      })
    )

    return taskFn as (this: TContext) => unknown
  }

  protected createResultProxy(requesterTaskName: keyof T): ResultProxy<T> {
    return new Proxy({} as ResultProxy<T>, {
      get: (_, referencedTaskName: string) =>
        this.waitForResult(referencedTaskName, requesterTaskName),
    })
  }

  protected waitForResult(taskName: keyof T, requesterTaskName?: keyof T): Promise<unknown> {
    if (requesterTaskName === taskName) {
      return Promise.reject(
        new Panic("TASK_SELF_REFERENCE", {
          message: `Task "${String(taskName)}" cannot await its own result`,
        })
      )
    }

    if (!Object.hasOwn(this.tasks, taskName)) {
      return Promise.reject(
        new Panic("TASK_UNKNOWN_REFERENCE", {
          message: `Unknown task "${String(taskName)}"`,
        })
      )
    }

    return this.taskSettlement(taskName).promise
  }

  /**
   * Memoized per-task settlement: `$result` reads and `runTask` share one deferred per task, so the
   * promise itself broadcasts and caches the outcome. A task may synchronously read a sibling that
   * has not started yet, which is why the deferred is created on first access rather than derived
   * from the task's own execution promise.
   */
  private taskSettlement(taskName: keyof T): PromiseWithResolvers<unknown> {
    let settlement = this.#settlements.get(taskName)

    if (!settlement) {
      settlement = Promise.withResolvers<unknown>()
      // Keep a task failure from surfacing as an unhandled rejection when no
      // sibling reads its `$result`; failures still propagate via `runTask`.
      void settlement.promise.catch((error: unknown) => void error)
      this.#settlements.set(taskName, settlement)
    }

    return settlement
  }

  protected abortInternal(error: unknown): void {
    if (!this.internalController.signal.aborted) {
      this.internalController.abort(error)
    }
  }

  /**
   * Backs the task context's `$race`: races a promise against the task signal and rejects with the
   * abort reason if the signal fires first. The abandoned promise stays observed inside
   * `resolveWithAbort`, so a late rejection cannot become an unhandled rejection.
   */
  protected async raceTaskSignal<V>(promise: PromiseLike<V>): Promise<V> {
    const raced = await resolveWithAbort(this.taskSignal, promise, () => TASK_RACE_ABORTED)

    if (raced === TASK_RACE_ABORTED) {
      throw this.taskSignal.reason
    }

    return raced as V
  }

  /**
   * Optional observation hooks: subclasses implement these to record task outcomes. These method
   * signatures are erased at compile time, so the base class leaves them undefined without emitting
   * fields that would shadow subclass prototype methods.
   */
  protected onTaskResult?(taskName: keyof T, value: unknown): void
  protected onTaskError?(taskName: keyof T, error: unknown): void

  // The two methods below are polymorphic defaults overridden by
  // subclasses (template-method pattern); they must stay instance methods
  // even though the base implementations do not touch `this`.

  // oxlint-disable-next-line class-methods-use-this -- polymorphic default
  protected mapStoredError(error: unknown): Error {
    return error instanceof Error ? error : new UnhandledException(undefined, { cause: error })
  }

  // oxlint-disable-next-line class-methods-use-this -- polymorphic default
  protected shouldRethrowTaskError(_error: unknown): boolean {
    return true
  }

  protected setFirstFailure(error: unknown, taskName?: keyof T & string): void {
    // Wrap the error: a task can throw `null` or `undefined`, and a bare value would let a later
    // failure replace the first one.
    this.firstFailure ??= { error, taskName }
  }

  protected abstract shouldAbortOnTaskError(error: unknown): boolean
  protected abstract createTaskContext(resultProxy: ResultProxy<T>): TContext

  protected async runTask(taskName: keyof T): Promise<void> {
    try {
      const taskFn = this.getTaskHandler(taskName)
      const resultProxy = this.createResultProxy(taskName)
      const context = this.createTaskContext(resultProxy)
      const result = await taskFn.call(context)

      this.taskSettlement(taskName).resolve(result)
      setTaskResult(this.#results, taskName as string, result)
      this.onTaskResult?.(taskName, result)
    } catch (error) {
      const mappedError = this.mapStoredError(error)

      if (isPanic(error)) {
        this.#panic ??= error
      }

      this.setFirstFailure(error, taskName as keyof T & string)
      this.taskSettlement(taskName).reject(mappedError)
      this.onTaskError?.(taskName, error)

      if (this.shouldAbortOnTaskError(error)) {
        // Abort with the mapped error so the signal reason siblings observe
        // (directly or via $race) is never undefined — abort(undefined) would
        // make the platform substitute a default AbortError.
        this.abortInternal(mappedError)
      }

      if (this.shouldRethrowTaskError(error)) {
        throw error
      }
    }
  }
}
defineAsyncDisposeAlias(TaskGraphExecutionBase.prototype)

abstract class TaskExecution<T extends TaskRecord> extends TaskGraphExecutionBase<
  T,
  TaskContext<T>
> {
  #settledPromise: Promise<Array<PromiseSettledResult<void>>> | undefined

  async waitForTasksToSettle(): Promise<void> {
    await this.#settledPromise
  }

  /**
   * Starts every task eagerly and captures the allSettled tracker up front so
   * `waitForTasksToSettle` works and task rejections are always observed.
   */
  protected startTasks(): Array<Promise<void>> {
    const promises = this.taskNames.map(async (name) => this.runTask(name))
    this.#settledPromise = Promise.allSettled(promises)
    return promises
  }

  protected override createTaskContext(resultProxy: ResultProxy<T>): TaskContext<T> {
    return Object.freeze({
      $disposer: this.disposer,
      $race: <V>(promise: PromiseLike<V>) => this.raceTaskSignal(promise),
      $result: resultProxy,
      $signal: this.taskSignal,
    })
  }
}

export class FailFastTaskExecution<T extends TaskRecord> extends TaskExecution<T> {
  async execute(): Promise<AllValue<T>> {
    try {
      await Promise.all(this.startTasks())
    } catch (error) {
      // oxlint-disable-next-line no-throw-literal, typescript/only-throw-error -- Report the raw task failure.
      throw this.firstFailure ? this.firstFailure.error : error
    }

    return this.results as AllValue<T>
  }

  // oxlint-disable-next-line class-methods-use-this -- polymorphic override
  protected override shouldAbortOnTaskError(): boolean {
    return true
  }
}

export class SettledTaskExecution<T extends TaskRecord> extends TaskExecution<T> {
  readonly #returnValue: Record<string, unknown> = {}

  async execute(): Promise<AllSettledResult<T>> {
    void this.startTasks()
    await this.waitForTasksToSettle()

    return this.#returnValue as AllSettledResult<T>
  }

  protected override onTaskResult(taskName: keyof T, value: unknown): void {
    setTaskResult(this.#returnValue, taskName as string, { status: "fulfilled", value })
  }

  protected override onTaskError(taskName: keyof T, error: unknown): void {
    setTaskResult(this.#returnValue, taskName as string, { reason: error, status: "rejected" })
  }

  // oxlint-disable-next-line class-methods-use-this -- polymorphic override
  protected override shouldAbortOnTaskError(error: unknown): boolean {
    return isPanic(error)
  }

  // oxlint-disable-next-line class-methods-use-this -- polymorphic override
  protected override shouldRethrowTaskError(): boolean {
    return false
  }
}
