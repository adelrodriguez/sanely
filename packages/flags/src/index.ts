export { createFlags } from "#lib/factory/index.ts"
export type { FlagFactory, FlagBatch } from "#lib/factory/index.ts"
export { decision } from "#lib/flag/decision.ts"
export { defineHook } from "#hooks/index.ts"
export {
  DecisionTypeMismatchError,
  DuplicateBatchKeyError,
  ForeignFlagEvaluatorError,
  FlagError,
  FlagTimeoutError,
  IdentityNotFoundError,
  InvalidVariantError,
  MalformedDecisionError,
  BatchFlagNotFoundError,
} from "#lib/shared/errors.ts"
export type {
  AnonymousFlagFactoryConfig,
  CallerIdentityFlagFactoryConfig,
  Decision,
  DecisionCache,
  DecisionCacheErrorReport,
  DecisionSource,
  EvaluationDetails,
  FlagChange,
  FlagCallOptions,
  FlagChanges,
  FlagEvaluator,
  FlagFactoryConfig,
  Hook,
  HookContext,
  HookErrorReport,
  Identity,
  IdentityValue,
  MaybePromise,
} from "#lib/types/index.ts"
