import type { FlagCallOptions, FlagChanges, FlagOptions } from "#lib/types/index.ts"

export type EvaluatorFactoryRef = {
  batch: (flags: readonly object[], callOptions?: FlagCallOptions<never>) => Promise<unknown>
  changes: FlagChanges
  /**
   * Reports a `subscribe` failure through the factory's `onCacheError`, as cache invalidation does,
   * for an integration that attaches to `changes` and continues without live invalidation.
   */
  reportSubscribeError: (flagKey: string, error: unknown) => void
}

export type EvaluatorRecord = {
  factoryRef: EvaluatorFactoryRef
  options: FlagOptions<string[]>
}

const recordsByEvaluator = new WeakMap<object, EvaluatorRecord>()

export function getEvaluatorRecord(evaluator: object): EvaluatorRecord | undefined {
  return recordsByEvaluator.get(evaluator)
}

export function registerEvaluator(evaluator: object, record: EvaluatorRecord): void {
  recordsByEvaluator.set(evaluator, record)
}
