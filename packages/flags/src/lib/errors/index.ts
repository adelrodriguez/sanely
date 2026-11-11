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
 * What is wrong with an invalid decision:
 *
 * - `malformed`: it is not a decision.
 * - `kind`: it is a decision of the other kind.
 * - `variant`: it names a variant that the flag does not allow.
 * - `payload`: the flag's payload parser rejected its payload.
 * - `missing`: a bulk provider's result has no decision for the flag.
 */
export type InvalidDecisionProblem = "kind" | "malformed" | "missing" | "payload" | "variant"

/**
 * The provider's decision does not fit the flag. `problem` says why, and `reason` describes it for
 * people.
 */
export class InvalidDecisionError extends Error {
  static readonly _tag = "InvalidDecisionError"
  readonly _tag = InvalidDecisionError._tag
  readonly decision: unknown
  readonly problem: InvalidDecisionProblem
  readonly reason: string

  constructor(
    args: { decision: unknown; problem: InvalidDecisionProblem; reason: string },
    options?: ErrorOptions
  ) {
    super(`Invalid decision: ${args.reason}`, options)
    this.name = "InvalidDecisionError"
    this.decision = args.decision
    this.problem = args.problem
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
  /**
   * The deadline that passed, in milliseconds.
   */
  readonly timeout: number

  constructor(timeout: number) {
    super(`Flag evaluation timed out after ${timeout}ms`)
    this.name = "EvaluationTimeoutError"
    this.timeout = timeout
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
 * The classes of the evaluation errors. `EvaluationError` and `isEvaluationError` both come from
 * this list, so a new evaluation error needs one entry here and the guard recognizes it.
 */
export const evaluationErrors = [
  EvaluationAbortedError,
  EvaluationTimeoutError,
  IdentityNotFoundError,
  InvalidDecisionError,
  ProviderFailedError,
] as const

/**
 * Why an evaluation returned the flag's default value. Evaluations return it in their details and
 * never throw it.
 */
export type EvaluationError = InstanceType<(typeof evaluationErrors)[number]>

export function isEvaluationError(error: unknown): error is EvaluationError {
  return evaluationErrors.some((ErrorClass) => error instanceof ErrorClass)
}
