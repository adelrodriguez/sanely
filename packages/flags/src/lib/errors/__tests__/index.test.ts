import { describe, expect, expectTypeOf, test } from "vitest"
import {
  EvaluationAbortedError,
  EvaluationTimeoutError,
  type EvaluationError,
  evaluationErrors,
  FlagDefinitionError,
  IdentityNotFoundError,
  InvalidDecisionError,
  isEvaluationError,
  ProviderFailedError,
} from "#lib/errors/index.ts"

describe("tagged errors", () => {
  test("tag each error with its class name", () => {
    const cause = new Error("cause")
    const errors = [
      new IdentityNotFoundError({ cause }),
      new InvalidDecisionError({ decision: 1, problem: "malformed", reason: "bad" }),
      new ProviderFailedError({ cause, provider: "fake" }),
      new EvaluationTimeoutError(50),
      new EvaluationAbortedError(cause),
      new FlagDefinitionError("bad key"),
    ]

    for (const error of errors) {
      expect(error).toBeInstanceOf(Error)
      expect(error._tag).toBe(error.name)
      expect(error._tag).toBe((error.constructor as unknown as { _tag: string })._tag)
    }
  })

  test("keep the context of each failure", () => {
    const cause = new Error("cause")

    expect(new IdentityNotFoundError({ cause }).cause).toBe(cause)
    expect(
      new InvalidDecisionError({ decision: 1, problem: "malformed", reason: "bad" })
    ).toMatchObject({
      decision: 1,
      message: "Invalid decision: bad",
      reason: "bad",
    })
    expect(new ProviderFailedError({ cause, provider: "fake" })).toMatchObject({
      cause,
      message: "The fake provider failed",
      provider: "fake",
    })
    expect(new EvaluationTimeoutError(50)).toMatchObject({
      message: "Flag evaluation timed out after 50ms",
      timeout: 50,
    })
    expect(new EvaluationAbortedError(cause).cause).toBe(cause)
    expect(new FlagDefinitionError("bad key")).toMatchObject({
      message: "Invalid flag definition: bad key",
      reason: "bad key",
    })
  })

  test("recognizes only evaluation errors", () => {
    expect(isEvaluationError(new IdentityNotFoundError())).toBe(true)
    expect(
      isEvaluationError(
        new InvalidDecisionError({ decision: 1, problem: "malformed", reason: "bad" })
      )
    ).toBe(true)
    expect(isEvaluationError(new ProviderFailedError({ cause: 1, provider: "p" }))).toBe(true)
    expect(isEvaluationError(new EvaluationTimeoutError(1))).toBe(true)
    expect(isEvaluationError(new EvaluationAbortedError(1))).toBe(true)
    expect(isEvaluationError(new FlagDefinitionError("x"))).toBe(false)
    expect(isEvaluationError(new Error("x"))).toBe(false)
  })
})

describe("evaluationErrors", () => {
  test("is the one list that both the union and the guard come from", () => {
    expectTypeOf<InstanceType<(typeof evaluationErrors)[number]>>().toEqualTypeOf<EvaluationError>()
    const tags = evaluationErrors.map((ErrorClass) => ErrorClass._tag)
    expect(new Set(tags).size).toBe(tags.length)
    for (const ErrorClass of evaluationErrors) {
      expect(isEvaluationError(Object.create(ErrorClass.prototype))).toBe(true)
    }
  })
})
