import type { Decision } from "#lib/types/index.ts"

export class FlagError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "FlagError"
  }
}

export class IdentityNotFoundError extends FlagError {
  constructor() {
    super("Identity not found")
    this.name = "IdentityNotFoundError"
  }
}

export class DecisionTypeMismatchError extends FlagError {
  readonly decision: Decision
  readonly expected: "boolean" | "variant"
  readonly received: "boolean" | "variant"

  constructor(expected: "boolean" | "variant", decision: Decision) {
    let received: "boolean" | "variant"
    let value: boolean | string

    if ("variant" in decision) {
      received = "variant"
      value = decision.variant
    } else {
      received = "boolean"
      value = decision.value
    }

    super(`Type mismatch: expected ${expected} decision but received ${received} "${value}"`)
    this.name = "DecisionTypeMismatchError"
    this.decision = decision
    this.expected = expected
    this.received = received
  }
}

export class MalformedDecisionError extends FlagError {
  readonly decision: unknown
  readonly reason: string

  constructor(decision: unknown, reason: string) {
    super(`Malformed decision: ${reason}`)
    this.name = "MalformedDecisionError"
    this.decision = decision
    this.reason = reason
  }
}

export class InvalidVariantError extends FlagError {
  readonly allowedVariants: readonly string[]
  readonly variant: string

  constructor(variant: string, allowedVariants: readonly string[]) {
    super(`Invalid variant: ${variant}`)
    this.name = "InvalidVariantError"
    this.allowedVariants = [...allowedVariants]
    this.variant = variant
  }
}

export class FlagTimeoutError extends FlagError {
  readonly timeoutMs: number

  constructor(timeoutMs: number) {
    super(`Flag evaluation timed out after ${timeoutMs}ms`)
    this.name = "FlagTimeoutError"
    this.timeoutMs = timeoutMs
  }
}

export class DuplicateBatchKeyError extends FlagError {
  readonly key: string

  constructor(key: string) {
    super(`Batch requires unique flag keys; duplicate: ${key}`)
    this.name = "DuplicateBatchKeyError"
    this.key = key
  }
}

export class ForeignFlagEvaluatorError extends FlagError {
  constructor() {
    super("Batch flags must be created by this flag factory")
    this.name = "ForeignFlagEvaluatorError"
  }
}

export class BatchFlagNotFoundError extends FlagError {
  constructor() {
    super("Flag is not part of this batch")
    this.name = "BatchFlagNotFoundError"
  }
}
