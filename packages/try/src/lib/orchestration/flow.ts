import type { InferredTaskContext, TaskRecord, TaskResult } from "./task-graph.ts"

declare const FLOW_EXIT_BRAND: unique symbol

export type FlowExit<T> = {
  readonly [FLOW_EXIT_BRAND]: T
}

type ExitValue<T> = T extends FlowExit<infer V> ? V : never

type FlowExitValue<T extends TaskRecord> = {
  [K in keyof T]: ExitValue<TaskResult<T[K]>>
}[keyof T]

export type InferredFlowTaskContext<T extends TaskRecord> = InferredTaskContext<T> & {
  readonly $exit: <V>(value: V) => FlowExit<V>
}

export type FlowResult<T extends TaskRecord> = FlowExitValue<T>

/**
 * The value each flow task resolves with when it does not exit.
 */
export type FlowValue<T extends TaskRecord> = {
  [K in keyof T]: Exclude<TaskResult<T[K]>, FlowExit<unknown>>
}
