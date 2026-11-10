import type { AsyncDisposer } from "#lib/disposal/index.ts"
import { disposer, defineAsyncDisposeAlias } from "#lib/disposal/index.ts"
import { Panic, UnhandledException, isPanic } from "#lib/shared/errors.ts"
import { invariant, resolveWithAbort } from "#lib/shared/utils.ts"
import type { Settlement, SettledResult, TaskEvent } from "./settlement.ts"

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

export type InferredTaskContext<T extends TaskRecord> = {
  readonly $result: {
    readonly [K in keyof T]: ReturnType<T[K]> extends Promise<infer R>
      ? Promise<R>
      : Promise<ReturnType<T[K]>>
  }
  readonly $signal: AbortSignal
  readonly $disposer: AsyncDisposer
  /**
   * Races a promise against `$signal`, rejecting with the abort reason if the signal fires first.
   * Wrap awaits on signal-unaware work so graph deadlines and cancellation bound wall-clock time.
   */
  readonly $race: <V>(promise: PromiseLike<V>) => Promise<V>
}

export type AllValue<T extends TaskRecord> = {
  [K in keyof T]: TaskResult<T[K]>
}

export type AllSettledResult<T extends TaskRecord> = {
  [K in keyof T]: SettledResult<TaskResult<T[K]>>
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
  readonly result: <K extends keyof V>(task: K) => V[K] | undefined
  /**
   * The task signal, already aborted by the failure.
   */
  readonly signal: AbortSignal
}

export interface CatchOptions<V, C> {
  catch: (error: unknown, ctx: CatchContext<V>) => C | Promise<C>
}

type GraphState = { status: "running" } | { status: "stopped"; event: TaskEvent }

/**
 * The abort reason that `$exit` throws to stop the rest of its task. It is an Error, so a sibling
 * that reads the exited task's `$result` gets an Error, but it is never a task failure: the exit is
 * recorded before it is thrown.
 */
class ExitSignalError extends Error {
  /**
   * The graph whose task exited, so a graph recognizes only its own exits.
   */
  readonly graph: TaskGraph

  constructor(graph: TaskGraph) {
    super("Flow exited")
    this.name = "ExitSignalError"
    this.graph = graph
  }
}

/**
 * Runs a task graph under one {@link Settlement}. The graph owns every piece of state that changes
 * during a run: the state of the graph, each task's outcome, the `$result` deferreds, the first
 * Panic, the task signal, and the cleanup stack.
 */
export class TaskGraph implements AsyncDisposable {
  readonly #tasks: TaskRecord
  readonly #settlement: Settlement
  readonly #controller = new AbortController()
  readonly #signal: AbortSignal
  readonly #disposer = disposer()
  readonly #resultDeferreds = new Map<string, PromiseWithResolvers<unknown>>()
  readonly #values: Record<string, unknown> = {}
  readonly #outcomes: Record<string, SettledResult<unknown>> = {}
  readonly #stopped = Promise.withResolvers<true>()
  #state: GraphState = { status: "running" }
  #panic: Panic | undefined
  #settled: Promise<unknown> = Promise.resolve()
  declare [Symbol.asyncDispose]: () => Promise<void>

  constructor(tasks: TaskRecord, settlement: Settlement, signal: AbortSignal | undefined) {
    this.#tasks = tasks
    this.#settlement = settlement
    this.#signal = signal
      ? AbortSignal.any([signal, this.#controller.signal])
      : this.#controller.signal
  }

  /**
   * The first Panic that a task threw. It wins over every other outcome.
   */
  get panic(): Panic | undefined {
    return this.#panic
  }

  /**
   * Starts every task and resolves with the graph's value when an exit stops it or every task
   * settles. It rejects with the task failure that stopped the graph, as the task threw it, or with
   * a Panic from the settlement, such as `FLOW_NO_EXIT`.
   */
  async run(): Promise<unknown> {
    this.#settled = Promise.allSettled(
      Object.keys(this.#tasks).map(async (task) => this.#runTask(task))
    )

    await Promise.race([this.#settled, this.#stopped.promise])

    if (this.#state.status === "stopped") {
      const { event } = this.#state

      if (event.kind === "rejected") {
        // oxlint-disable-next-line no-throw-literal, typescript/only-throw-error -- Report the raw task failure.
        throw event.error
      }

      return event.value
    }

    return this.#settlement.settle({ outcomes: this.#outcomes, values: this.#values })
  }

  /**
   * Resolves when every task has settled, so no task code still runs.
   */
  async waitForTasksToSettle(): Promise<void> {
    await this.#settled
  }

  createCatchContext(): CatchContext<Record<string, unknown>> {
    const { failedTask } = this
    // Siblings keep settling while an async catch runs, so read from a snapshot.
    const snapshot = { ...this.#values }

    return Object.freeze({
      failedTask,
      result: (task: string) => (Object.hasOwn(snapshot, task) ? snapshot[task] : undefined),
      signal: this.#signal,
    })
  }

  async dispose(): Promise<void> {
    await this.#disposer.dispose()
  }

  get failedTask(): string | undefined {
    return this.#state.status === "stopped" && this.#state.event.kind === "rejected"
      ? this.#state.event.task
      : undefined
  }

  async #runTask(task: string): Promise<void> {
    const deferred = this.#resultDeferred(task)

    try {
      const value = await this.#handler(task).call(this.#createContext(task))

      deferred.resolve(value)
      setTaskResult(this.#values, task, value)
      setTaskResult(this.#outcomes, task, { status: "fulfilled", value })
      this.#record({ kind: "fulfilled", task, value })
    } catch (error) {
      // The exit was recorded when `$exit` ran. Its throw only stopped the rest of the task.
      if (error instanceof ExitSignalError && error.graph === this) {
        deferred.reject(error)
        return
      }

      // Siblings observe the failure as an abort reason and a `$result` rejection, and neither may
      // be undefined: abort(undefined) would make the platform substitute a default AbortError.
      const reason =
        error instanceof Error ? error : new UnhandledException(undefined, { cause: error })

      deferred.reject(reason)

      if (isPanic(error)) {
        this.#panic ??= error
        this.#stop({ error, kind: "rejected", task }, reason)
        return
      }

      setTaskResult(this.#outcomes, task, { reason: error, status: "rejected" })
      this.#record({ error, kind: "rejected", task }, reason)
    }
  }

  #record(event: TaskEvent, abortReason?: Error): void {
    if (this.#settlement.stops(event)) {
      this.#stop(event, abortReason)
    }
  }

  #stop(event: TaskEvent, abortReason: Error | undefined): void {
    if (this.#state.status !== "running") {
      return
    }

    this.#state = { event, status: "stopped" }

    if (!this.#controller.signal.aborted) {
      this.#controller.abort(abortReason)
    }

    this.#stopped.resolve(true)
  }

  #exit(task: string, value: unknown): never {
    // Record the exit before throwing, so a task that catches the throw, or a nested run() that
    // maps it, still ends the flow. The throw only stops the rest of the task.
    const exit = new ExitSignalError(this)
    this.#record({ kind: "exited", task, value }, exit)
    throw exit
  }

  #createContext(task: string): object {
    const context: Record<string, unknown> = {
      $disposer: this.#disposer,
      $race: <V>(promise: PromiseLike<V>) => this.#raceTaskSignal(promise),
      $result: this.#createResultProxy(task),
      $signal: this.#signal,
    }

    if (this.#settlement.exits) {
      context.$exit = (value: unknown) => this.#exit(task, value)
    }

    return Object.freeze(context)
  }

  #handler(task: string): (this: object) => unknown {
    const handler: unknown = this.#tasks[task]

    invariant(
      typeof handler === "function",
      new Panic("TASK_INVALID_HANDLER", {
        message: `Task "${task}" is not a function`,
      })
    )

    return handler as (this: object) => unknown
  }

  #createResultProxy(requester: string): object {
    return new Proxy(
      {},
      {
        get: (_, referenced: string) => this.#waitForResult(referenced, requester),
      }
    )
  }

  #waitForResult(task: string, requester: string): Promise<unknown> {
    if (requester === task) {
      return Promise.reject(
        new Panic("TASK_SELF_REFERENCE", {
          message: `Task "${task}" cannot await its own result`,
        })
      )
    }

    if (!Object.hasOwn(this.#tasks, task)) {
      return Promise.reject(
        new Panic("TASK_UNKNOWN_REFERENCE", {
          message: `Unknown task "${task}"`,
        })
      )
    }

    return this.#resultDeferred(task).promise
  }

  /**
   * Memoized per-task result deferred: `$result` reads and the task run share one deferred per
   * task, so the promise itself broadcasts and caches the outcome. A task may synchronously read a
   * sibling that has not started yet, which is why the deferred is created on first access.
   */
  #resultDeferred(task: string): PromiseWithResolvers<unknown> {
    let deferred = this.#resultDeferreds.get(task)

    if (!deferred) {
      deferred = Promise.withResolvers<unknown>()
      // Keep a task failure from surfacing as an unhandled rejection when no sibling reads its
      // `$result`; the graph still records the failure.
      void deferred.promise.catch((error: unknown) => void error)
      this.#resultDeferreds.set(task, deferred)
    }

    return deferred
  }

  /**
   * Backs the task context's `$race`: races a promise against the task signal and rejects with the
   * abort reason if the signal fires first. The abandoned promise stays observed inside
   * `resolveWithAbort`, so a late rejection cannot become an unhandled rejection.
   */
  async #raceTaskSignal<V>(promise: PromiseLike<V>): Promise<V> {
    const raced = await resolveWithAbort(this.#signal, promise, () => TASK_RACE_ABORTED)

    if (raced === TASK_RACE_ABORTED) {
      throw this.#signal.reason
    }

    return raced as V
  }
}
defineAsyncDisposeAlias(TaskGraph.prototype)
