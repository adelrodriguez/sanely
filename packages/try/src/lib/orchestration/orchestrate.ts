import type { BuilderConfig } from "#lib/policies/options.ts"
import { createSuppressedError } from "#lib/disposal/index.ts"
import { BaseExecution } from "#lib/execution/base.ts"
import { Panic, UnhandledException, isPanic } from "#lib/shared/errors.ts"
import { checkIsPromiseLike, invariant } from "#lib/shared/utils.ts"
import { type OrchestrationMode, settlements } from "./settlement.ts"
import { type CatchOptions, TaskGraph, type TaskRecord } from "./task-graph.ts"

/**
 * The outcome of an orchestration before control state and Panics are applied.
 */
type Outcome = { mapped: unknown } | { thrown: unknown } | { panic: Panic }

/**
 * What running the cleanup on `$disposer` did. It records the thrown value, so a cleanup that
 * throws `undefined` still counts as a failure.
 */
type Cleanup = { status: "done" } | { status: "threw"; error: unknown }

type CatchFn = CatchOptions<Record<string, unknown>, unknown>["catch"]

class OrchestrationExecution extends BaseExecution<Promise<unknown>> {
  readonly #mode: OrchestrationMode
  readonly #tasks: TaskRecord
  readonly #catchFn: CatchFn | undefined

  constructor(
    config: BuilderConfig,
    mode: OrchestrationMode,
    tasks: TaskRecord,
    catchFn: CatchFn | undefined
  ) {
    invariant(
      config.retry === undefined,
      new Panic("ORCHESTRATION_UNSUPPORTED_POLICY", {
        message: "Orchestration does not support retry policies.",
      })
    )

    super(config)
    this.#mode = mode
    this.#tasks = tasks
    this.#catchFn = catchFn
  }

  protected override async executeCore(): Promise<unknown> {
    const controlBeforeExecution = this.checkDidControlFail()

    if (controlBeforeExecution) {
      return controlBeforeExecution
    }

    return await this.#runGraph()
  }

  /**
   * Runs the task graph, races it against cancellation and the graph deadline, waits for in-flight
   * tasks to settle before resolving (so no task code is still running once the orchestration
   * returns), and reports the outcome as a value, the same way `run()` does:
   *
   * - A Panic throws, and wins over everything else. A task Panic comes first, then a Panic from
   *   `catch`, then a Panic for a cleanup that threw.
   * - This call's own cancellation, then its deadline, win over the result or the failure.
   * - A mapped result is returned as is.
   * - An unmapped task failure becomes an {@link UnhandledException} with the failure as `cause`.
   */
  async #runGraph(): Promise<unknown> {
    const graph = new TaskGraph(this.#tasks, settlements[this.#mode], this.executionSignal)
    let outcome: Outcome
    // The failure that stopped the graph, kept even after catch maps it. A record, so a task that
    // throws undefined still counts.
    let stoppedBy: { error: unknown } | undefined

    try {
      outcome = { mapped: await this.race(graph.run()) }
    } catch (error) {
      stoppedBy = { error }
      outcome = await this.#mapFailure(graph, error)
    } finally {
      await graph.waitForTasksToSettle()
    }

    // Control state may have changed while tasks ran or settled, and it takes priority over the
    // outcome; the shared chain reports cancellation over the graph deadline when both fired. Read
    // it before the cleanup runs, so the time that cleanup takes never changes the result.
    const controlError = this.checkDidControlFail("thrown" in outcome ? outcome.thrown : undefined)
    const cleanup = await graph.dispose().then(
      (): Cleanup => ({ status: "done" }),
      (error: unknown): Cleanup => ({ error, status: "threw" })
    )

    // A Panic is programmer misuse, so it overrides any result or failure, as in run(): even one
    // that settled after catch mapped an earlier failure, or after cancellation or the deadline.
    if (graph.panic) {
      throw graph.panic
    }

    // A catch handler that throws or rejects is misuse too, so its Panic also wins over this call's
    // own cancellation or deadline, even one that the handler itself triggered.
    if ("panic" in outcome) {
      throw outcome.panic
    }

    // A cleanup that throws is misuse, like a catch handler that throws. The Panic keeps this
    // call's own policy failure, or else the task failure that stopped the graph, as the suppressed
    // error, so the cleanup does not hide it.
    if (cleanup.status === "threw") {
      const suppressed = controlError ? { error: controlError } : stoppedBy

      throw new Panic("TASK_CLEANUP_THROW", {
        cause: suppressed ? createSuppressedError(cleanup.error, suppressed.error) : cleanup.error,
      })
    }

    if (controlError) {
      return controlError
    }

    if ("mapped" in outcome) {
      return outcome.mapped
    }

    // A Panic from the settlement, such as FLOW_NO_EXIT, comes after control state: a deadline or
    // cancellation that stopped every task also explains why no task exited.
    if (isPanic(outcome.thrown)) {
      throw outcome.thrown
    }

    return new UnhandledException(undefined, { cause: outcome.thrown })
  }

  /**
   * Maps the failure that stopped the graph through `catch`, with the same rules as `run()`: this
   * call's own policy failures and Panics never reach `catch`, and a `catch` that throws or rejects
   * reports a Panic.
   */
  async #mapFailure(graph: TaskGraph, error: unknown): Promise<Outcome> {
    const controlAfterFailure = this.checkDidControlFail(error)

    if (controlAfterFailure) {
      return { thrown: controlAfterFailure }
    }

    const catchFn = this.#catchFn

    // A task Panic is recorded on the graph, and a Panic from the settlement, such as FLOW_NO_EXIT,
    // arrives as `error`.
    if (!catchFn || graph.panic || isPanic(error)) {
      return { thrown: error }
    }

    try {
      const mapped = catchFn(error, graph.createCatchContext())

      if (!checkIsPromiseLike(mapped)) {
        return { mapped }
      }

      try {
        return {
          mapped: await this.raceWithCancellation(
            Promise.resolve(mapped).catch((catchError: unknown) => {
              throw new Panic("CATCH_HANDLER_REJECT", { cause: catchError })
            }),
            error
          ),
        }
      } catch (mappedError) {
        return isPanic(mappedError) ? { panic: mappedError } : { thrown: mappedError }
      }
    } catch (catchError) {
      return { panic: new Panic("CATCH_HANDLER_THROW", { cause: catchError }) }
    }
  }
}

/**
 * Runs a task graph under the settlement of `mode`. The builder declares the result type of each
 * orchestration API; at runtime the result is the graph's value, a value from `catch`, an
 * {@link UnhandledException}, or this call's own policy failure.
 */
export async function orchestrate<V, C>(
  config: BuilderConfig,
  mode: OrchestrationMode,
  tasks: TaskRecord,
  options?: CatchOptions<V, C>
): Promise<unknown> {
  // The graph records task results without their types; `V` names them for `catch`.
  const catchFn = options?.catch as CatchFn | undefined

  using execution = new OrchestrationExecution(config, mode, tasks, catchFn)
  return await execution.execute()
}
