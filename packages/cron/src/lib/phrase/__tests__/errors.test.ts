import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { InvalidScheduleError, withInput } from "#lib/phrase/errors.ts"
import { ParseError } from "#lib/schedule/rules.ts"

describe("InvalidScheduleError", () => {
  it("should be an Error with its own name", () => {
    const error = new InvalidScheduleError("every 7 minutes", "7 does not divide 60")

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe("InvalidScheduleError")
  })

  it("should build the message from the reason and the input as JSON", () => {
    expect(new InvalidScheduleError("every 7 minutes", "7 does not divide 60").message).toBe(
      'Invalid schedule: 7 does not divide 60. Received: "every 7 minutes"'
    )
    expect(new InvalidScheduleError({ every: "week" }, "reason", ["every"]).message).toBe(
      'Invalid schedule at "every": reason. Received: {"every":"week"}'
    )
  })

  it("should write the path with dots for keys and brackets for indexes", () => {
    expect(new InvalidScheduleError({}, "reason", ["at", "hour"]).message).toContain('at "at.hour"')
    expect(new InvalidScheduleError({}, "reason", ["on", 2]).message).toContain('at "on[2]"')
  })

  it("should describe an input that JSON cannot show", () => {
    const circular: { self?: unknown } = {}
    circular.self = circular

    expect(new InvalidScheduleError(undefined, "reason").message).toBe(
      "Invalid schedule: reason. Received: undefined"
    )
    expect(new InvalidScheduleError(10n, "reason").message).toBe(
      "Invalid schedule: reason. Received: 10"
    )
    expect(new InvalidScheduleError(circular, "reason").message).toBe(
      "Invalid schedule: reason. Received: [object Object]"
    )
  })

  it("should not fail for an input that cannot become a string", () => {
    const input = { toJSON: () => Symbol("x"), toString: null }

    expect(new InvalidScheduleError(input, "reason").message).toBe(
      "Invalid schedule: reason. Received: [object Object]"
    )
  })

  it("should store the input, the reason, and the path without a change", () => {
    fc.assert(
      fc.property(fc.anything(), fc.string(), (value, reason) => {
        const error = new InvalidScheduleError(value, reason, ["on", 0])

        expect(error.value).toBe(value)
        expect(error.reason).toBe(reason)
        expect(error.path).toEqual(["on", 0])
      })
    )
  })
})

function failAt(): never {
  throw new ParseError("the key is required", ["at"])
}

describe("withInput", () => {
  it("should return the result of the step", () => {
    expect(withInput("input", () => 15)).toBe(15)
  })

  it("should change a ParseError to an InvalidScheduleError for the input", () => {
    expect(() => withInput({ every: "day" }, failAt)).toThrow(InvalidScheduleError)
    expect(() => withInput({ every: "day" }, failAt)).toThrow(
      'Invalid schedule at "at": the key is required. Received: {"every":"day"}'
    )
  })

  it("should not change other errors", () => {
    const failure = new TypeError("bug")

    expect(() =>
      withInput("input", () => {
        throw failure
      })
    ).toThrow(failure)
  })
})
