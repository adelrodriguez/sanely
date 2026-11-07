export { createFlags } from "./factory"
export type { FlagFactory, FlagBatch } from "./factory"
export { decision } from "./decision"
export { defineHook } from "./hooks"
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
