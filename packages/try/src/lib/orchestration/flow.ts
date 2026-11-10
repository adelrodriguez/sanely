import type { BuilderConfig } from "#lib/policies/options.ts"
import { Panic, type UnhandledException } from "#lib/shared/errors.ts"
import type {
  ControlFailure,
  InferredTaskContext,
  ResultProxy,
  TaskContext,
  TaskRecord,
  TaskResult,
} from "./task-graph"
import { OrchestrationExecution, TaskGraphExecutionBase } from "./task-graph"

declare const FLOW_EXIT_BRAND: unique symbol

export type FlowExit<T> = {
  readonly [FLOW_EXIT_BRAND]: T
}

type ExitValue<T> = T extends FlowExit<infer V> ? V : never

type FlowExitValue<T extends TaskRecord> = {
  [K in keyof T]: ExitValue<TaskResult<T[K]>>
}[keyof T]

interface FlowTaskContext<T extends TaskRecord> extends TaskContext<T> {
  readonly $exit: <V>(value: V) => FlowExit<V>
}

export type InferredFlowTaskContext<T extends TaskRecord> = InferredTaskContext<T> & {
  readonly $exit: <V>(value: V) => FlowExit<V>
}

export type FlowResult<T extends TaskRecord> = FlowExitValue<T>

class FlowExitSignalError extends Error {
  readonly value: unknown

  constructor(value: unknown) {
    super("Flow exited")
    this.name = "FlowExitSignalError"
    this.value = value
  }
}

class FlowExecution<T extends TaskRecord> extends TaskGraphExecutionBase<T, FlowTaskContext<T>> {
  #firstFailureWaiters: Array<() => void> = []
  #settledPromise: Promise<Array<PromiseSettledResult<void>>> | undefined

  async execute(): Promise<FlowResult<T>> {
    const promises = this.taskNames.map(async (name) => this.runTask(name))
    this.#settledPromise = Promise.allSettled(promises)

    // A flow terminates on the first exit or error, but Promise.allSettled()
    // never rejects, so it cannot signal that early completion on its own.
    // Racing it against a manual first-rejection waiter lets execute() react to
    // the first $exit/error immediately, while #settledPromise is retained so
    // the orchestration layer can still await full task teardown afterwards.
    await Promise.race([this.#settledPromise, this.waitForFirstFailure()])

    if (this.firstFailure !== undefined) {
      if (this.firstFailure.error instanceof FlowExitSignalError) {
        return this.firstFailure.error.value as FlowResult<T>
      }

      // oxlint-disable-next-line no-throw-literal, typescript/only-throw-error -- Report the raw task failure.
      throw this.firstFailure.error
    }

    throw new Panic("FLOW_NO_EXIT")
  }

  async waitForTasksToSettle(): Promise<void> {
    await this.#settledPromise
  }

  protected override setFirstFailure(error: unknown): void {
    if (this.firstFailure !== undefined) {
      return
    }

    super.setFirstFailure(error)

    for (const resolve of this.#firstFailureWaiters) {
      resolve()
    }

    this.#firstFailureWaiters = []
  }

  protected override createTaskContext(resultProxy: ResultProxy<T>): FlowTaskContext<T> {
    return Object.freeze({
      $disposer: this.disposer,
      $exit: <V>(value: V): FlowExit<V> => {
        // Record the exit before throwing, so a task that catches the throw, or a nested run()
        // that maps it, still ends the flow. The throw only stops the rest of the task.
        const exit = new FlowExitSignalError(value)
        this.setFirstFailure(exit)
        this.abortInternal(exit)
        throw exit
      },
      $race: <V>(promise: PromiseLike<V>) => this.raceTaskSignal(promise),
      $result: resultProxy,
      $signal: this.taskSignal,
    })
  }

  protected override mapStoredError(error: unknown): Error {
    if (error instanceof FlowExitSignalError) {
      return error
    }

    return super.mapStoredError(error)
  }

  // oxlint-disable-next-line class-methods-use-this -- polymorphic override
  protected override shouldAbortOnTaskError(): boolean {
    return true
  }

  private waitForFirstFailure(): Promise<void> {
    if (this.firstFailure !== undefined) {
      return Promise.resolve()
    }

    return new Promise((resolve) => {
      this.#firstFailureWaiters.push(resolve)
    })
  }
}

class FlowRunnerExecution<T extends TaskRecord> extends OrchestrationExecution<FlowResult<T>> {
  readonly #tasks: T

  constructor(config: BuilderConfig, tasks: T) {
    super(config)
    this.#tasks = tasks
  }

  protected override executeTasks(): Promise<FlowResult<T> | UnhandledException | ControlFailure> {
    return this.executeTaskGraph(new FlowExecution(this.executionSignal, this.#tasks))
  }
}

export async function executeFlow<T extends TaskRecord>(
  config: BuilderConfig,
  tasks: T & ThisType<InferredFlowTaskContext<T>>
): Promise<FlowResult<T> | UnhandledException | ControlFailure> {
  using execution = new FlowRunnerExecution(config, tasks)
  return await execution.execute()
}
