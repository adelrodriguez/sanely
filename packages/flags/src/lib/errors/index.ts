// Each class declares its tag as a static literal and repeats it on the instance, so `_tag`
// narrows an `EvaluationError` union without `instanceof`.

/**
 * The evaluation found no identity: `identify` returned nothing or threw, or a caller passed no
 * identity to `for`.
 */
export class IdentityNotFoundError extends Error {
  static readonly _tag = "IdentityNotFoundError"
  readonly _tag = IdentityNotFoundError._tag

  constructor(options?: ErrorOptions) {
    super("No identity was found for the evaluation", options)
    this.name = "IdentityNotFoundError"
  }
}

/**
 * The provider's decision does not fit the flag: it is malformed, has the other kind, names a
 * variant that the flag does not allow, carries a payload that the flag's parser rejects, or is
 * missing from a bulk provider's result.
 */
export class InvalidDecisionError extends Error {
  static readonly _tag = "InvalidDecisionError"
  readonly _tag = InvalidDecisionError._tag
  readonly decision: unknown
  readonly reason: string

  constructor(args: { decision: unknown; reason: string }, options?: ErrorOptions) {
    super(`Invalid decision: ${args.reason}`, options)
    this.name = "InvalidDecisionError"
    this.decision = args.decision
    this.reason = args.reason
  }
}

/**
 * The provider threw or rejected. `cause` holds what it threw.
 */
export class ProviderFailedError extends Error {
  static readonly _tag = "ProviderFailedError"
  readonly _tag = ProviderFailedError._tag
  readonly provider: string

  constructor(args: { cause: unknown; provider: string }) {
    super(`The ${args.provider} provider failed`, { cause: args.cause })
    this.name = "ProviderFailedError"
    this.provider = args.provider
  }
}

/**
 * The evaluation passed its deadline.
 */
export class EvaluationTimeoutError extends Error {
  static readonly _tag = "EvaluationTimeoutError"
  readonly _tag = EvaluationTimeoutError._tag
  readonly timeoutMs: number

  constructor(timeoutMs: number) {
    super(`Flag evaluation timed out after ${timeoutMs}ms`)
    this.name = "EvaluationTimeoutError"
    this.timeoutMs = timeoutMs
  }
}

/**
 * The caller's signal aborted the evaluation. `cause` holds the signal's reason.
 */
export class EvaluationAbortedError extends Error {
  static readonly _tag = "EvaluationAbortedError"
  readonly _tag = EvaluationAbortedError._tag

  constructor(cause: unknown) {
    super("Flag evaluation was aborted", { cause })
    this.name = "EvaluationAbortedError"
  }
}

/**
 * A flag, provider, or `createFlags` option is not valid. Thrown when the definition is built,
 * never during an evaluation.
 */
export class FlagDefinitionError extends Error {
  static readonly _tag = "FlagDefinitionError"
  readonly _tag = FlagDefinitionError._tag
  readonly reason: string

  constructor(reason: string) {
    super(`Invalid flag definition: ${reason}`)
    this.name = "FlagDefinitionError"
    this.reason = reason
  }
}

/**
 * Why an evaluation returned the flag's default value. Evaluations return it in their details and
 * never throw it.
 */
export type EvaluationError =
  | EvaluationAbortedError
  | EvaluationTimeoutError
  | IdentityNotFoundError
  | InvalidDecisionError
  | ProviderFailedError

export function isEvaluationError(error: unknown): error is EvaluationError {
  return (
    error instanceof EvaluationAbortedError
    || error instanceof EvaluationTimeoutError
    || error instanceof IdentityNotFoundError
    || error instanceof InvalidDecisionError
    || error instanceof ProviderFailedError
  )
}
