export type PanicCode =
  | "CATCH_HANDLER_REJECT"
  | "CATCH_HANDLER_THROW"
  | "FLOW_NO_EXIT"
  | "ORCHESTRATION_UNSUPPORTED_POLICY"
  | "RETRY_INVALID_DELAY"
  | "RETRY_INVALID_LIMIT"
  | "RUN_SYNC_ASYNC_RETRY_POLICY"
  | "RUN_SYNC_CATCH_PROMISE"
  | "RUN_SYNC_TRY_PROMISE"
  | "RUN_SYNC_WRAPPED_RESULT_PROMISE"
  | "TASK_CLEANUP_THROW"
  | "TASK_INVALID_HANDLER"
  | "TASK_SELF_REFERENCE"
  | "TASK_UNKNOWN_REFERENCE"
  | "TIMEOUT_INVALID_MS"
  | "UNREACHABLE_RETRY_POLICY_BACKOFF"
  | "UNREACHABLE_WORK_STATE"
  | "WRAP_NEXT_CALLED_TWICE"
  | "WRAP_NEXT_NOT_CALLED"
  | "WRAP_THROW"

export const PanicMessages = {
  CATCH_HANDLER_REJECT: "A catch handler rejected.",
  CATCH_HANDLER_THROW: "A catch handler threw.",
  FLOW_NO_EXIT: "flow() requires at least one task to call $exit().",
  ORCHESTRATION_UNSUPPORTED_POLICY: "Orchestration does not support retry() policies.",
  RETRY_INVALID_DELAY: "retry() requires a non-negative finite delayMs and maxDelayMs.",
  RETRY_INVALID_LIMIT: "retry() requires a positive integer retry limit.",
  RUN_SYNC_ASYNC_RETRY_POLICY: "This retry policy may run asynchronously. Use run() instead.",
  RUN_SYNC_CATCH_PROMISE: "runSync() catch cannot return a Promise. Use run() instead.",
  RUN_SYNC_TRY_PROMISE: "runSync() cannot handle Promise values. Use run() instead.",
  RUN_SYNC_WRAPPED_RESULT_PROMISE:
    "Wrapped runSync() execution returned a Promise. Use run() instead.",
  TASK_CLEANUP_THROW: "A task cleanup threw or rejected.",
  TASK_INVALID_HANDLER: "Task runner expected a function handler.",
  TASK_SELF_REFERENCE: "Task cannot await its own result.",
  TASK_UNKNOWN_REFERENCE: "Task attempted to read an unknown task result.",
  TIMEOUT_INVALID_MS: "timeout() requires a non-negative finite millisecond value.",
  UNREACHABLE_RETRY_POLICY_BACKOFF: "Panic: unreachable retry policy backoff",
  UNREACHABLE_WORK_STATE: "Panic: unreachable wrapped work state",
  WRAP_NEXT_CALLED_TWICE: "wrap() called next() more than once.",
  WRAP_NEXT_NOT_CALLED: "wrap() returned without calling next().",
  WRAP_THROW: "wrap() threw or rejected.",
} as const satisfies Record<PanicCode, string>

/**
 * @internal
 */
export class ControlError extends Error {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "ControlError"
  }
}

export class CancellationError extends ControlError {
  constructor(message = "Execution was cancelled", options?: ErrorOptions) {
    super(message, options)
    this.name = "CancellationError"
  }
}

export class TimeoutError extends ControlError {
  constructor(message = "Execution timed out", options?: ErrorOptions) {
    super(message, options)
    this.name = "TimeoutError"
  }
}

export class RetryExhaustedError extends Error {
  constructor(message = "Retry attempts exhausted", options?: ErrorOptions) {
    super(message, options)
    this.name = "RetryExhaustedError"
  }
}

// oxlint-disable-next-line unicorn/custom-error-definition -- Public error name is intentional.
export class UnhandledException extends Error {
  constructor(message = "Unhandled exception", options?: ErrorOptions) {
    super(message, options)
    this.name = "UnhandledException"
  }
}

// oxlint-disable-next-line unicorn/custom-error-definition -- Public error name is intentional.
export class Panic extends Error {
  readonly code: PanicCode

  constructor(code: PanicCode, options: ErrorOptions & { message?: string } = {}) {
    const { message, ...errorOptions } = options

    super(message ?? PanicMessages[code], errorOptions)
    this.code = code
    this.name = "Panic"
  }
}

// Type guards below match by `error.name` in addition to instanceof, so they
// keep working when two copies of the package end up in one dependency graph
// (or across realms), where instanceof silently fails. They are the
// recommended way to identify the errors of the package.
//
// Caveat: name matching means a foreign Error that happens to use the same
// `name` also passes. Within the unions returned by the package APIs this cannot
// occur.

/**
 * `Error.isError` recognizes errors from any realm but is missing on Node 22, which the package
 * supports. Fall back to the built-in `[object Error]` tag there, which cross-realm errors also
 * carry. The tag comes from the internal error slot only when `Symbol.toStringTag` does not
 * override it, so reject objects that define one.
 */
function checkIsError(value: unknown): value is Error {
  // `Error.isError` is absent on Node 22.
  if (typeof Error.isError === "function") {
    return Error.isError(value)
  }

  if (value instanceof Error) {
    return true
  }

  return (
    typeof value === "object"
    && value !== null
    && !(Symbol.toStringTag in value)
    && Object.prototype.toString.call(value) === "[object Error]"
  )
}

export function isCancellationError(error: unknown): error is CancellationError {
  return (
    error instanceof CancellationError
    || (checkIsError(error) && error.name === "CancellationError")
  )
}

export function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError || (checkIsError(error) && error.name === "TimeoutError")
}

export function isRetryExhaustedError(error: unknown): error is RetryExhaustedError {
  return (
    error instanceof RetryExhaustedError
    || (checkIsError(error) && error.name === "RetryExhaustedError")
  )
}

export function isUnhandledException(error: unknown): error is UnhandledException {
  return (
    error instanceof UnhandledException
    || (checkIsError(error) && error.name === "UnhandledException")
  )
}

export function isPanic(error: unknown): error is Panic {
  return (
    error instanceof Panic
    || (checkIsError(error)
      && error.name === "Panic"
      && "code" in error
      && typeof error.code === "string")
  )
}
