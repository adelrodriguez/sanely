import type { BuilderConfig } from "#lib/policies/options.ts"
import type { UnhandledException } from "#lib/shared/errors.ts"
import {
  FailFastTaskExecution,
  OrchestrationExecution,
  type AllValue,
  type CatchOptions,
  type ControlFailure,
  type InferredTaskContext,
  type TaskRecord,
  type TaskResult,
  type TaskValidation,
} from "./task-graph"

class AllExecution<T extends TaskRecord, C> extends OrchestrationExecution<AllValue<T> | C> {
  readonly #tasks: T
  readonly #options: CatchOptions<AllValue<T>, C> | undefined

  constructor(config: BuilderConfig, tasks: T, options?: CatchOptions<AllValue<T>, C>) {
    super(config)
    this.#tasks = tasks
    this.#options = options
  }

  protected override executeTasks(): Promise<
    AllValue<T> | C | UnhandledException | ControlFailure
  > {
    const execution = new FailFastTaskExecution(this.executionSignal, this.#tasks)

    return this.executeTaskGraph<AllValue<T> | C>(execution, {
      mapFailure: (error) => this.mapCatch(this.#options?.catch, execution, error),
    })
  }
}

export async function executeAll<T extends TaskRecord, C = never>(
  config: BuilderConfig,
  tasks: T & TaskValidation<NoInfer<T>> & ThisType<InferredTaskContext<T>>,
  options?: CatchOptions<AllValue<T>, C>
): Promise<{ [K in keyof T]: TaskResult<T[K]> } | C | UnhandledException | ControlFailure> {
  using execution = new AllExecution(config, tasks, options)
  return await execution.execute()
}
