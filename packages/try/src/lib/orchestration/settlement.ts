import { Panic } from "#lib/shared/errors.ts"

export interface SettledFulfilled<T> {
  status: "fulfilled"
  value: T
}

export interface SettledRejected {
  status: "rejected"
  reason: unknown
}

export type SettledResult<T> = SettledFulfilled<T> | SettledRejected

/**
 * What happened to one task. A task that throws a Panic is `rejected`; the graph records the Panic
 * separately, because it wins over every other outcome.
 */
export type TaskEvent =
  | { kind: "fulfilled"; task: string; value: unknown }
  | { kind: "rejected"; task: string; error: unknown }
  | { kind: "exited"; task: string; value: unknown }

/**
 * The task results once every task has settled without stopping the graph.
 */
export interface SettledGraph {
  /**
   * The value of each task that fulfilled, by task name.
   */
  readonly values: Record<string, unknown>
  /**
   * The settled outcome of every task, by task name.
   */
  readonly outcomes: Record<string, SettledResult<unknown>>
}

/**
 * The rules that make one orchestration API differ from the others.
 */
export interface Settlement {
  /**
   * Whether tasks can end the graph with `$exit`.
   */
  readonly exits: boolean
  /**
   * Whether this event stops the graph and aborts the other tasks. A Panic always stops it.
   */
  stops(event: TaskEvent): boolean
  /**
   * The value of the graph when every task settled and no event stopped it.
   */
  settle(graph: SettledGraph): unknown
}

export type OrchestrationMode = "all" | "allSettled" | "flow"

export const settlements = {
  all: {
    exits: false,
    settle: (graph) => graph.values,
    stops: (event) => event.kind === "rejected",
  },
  allSettled: {
    exits: false,
    settle: (graph) => graph.outcomes,
    stops: () => false,
  },
  flow: {
    exits: true,
    settle: () => {
      throw new Panic("FLOW_NO_EXIT")
    },
    stops: (event) => event.kind !== "fulfilled",
  },
} as const satisfies Record<OrchestrationMode, Settlement>
