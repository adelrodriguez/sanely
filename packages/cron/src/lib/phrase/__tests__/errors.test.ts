import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { InvalidCronPhraseError } from "#lib/phrase/errors.ts"

describe("InvalidCronPhraseError", () => {
  it("should be an Error with its own name", () => {
    const error = new InvalidCronPhraseError("every 7 minutes", "7 does not divide 60")

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe("InvalidCronPhraseError")
  })

  it("should include the reason and the quoted input in the message", () => {
    const error = new InvalidCronPhraseError("every 7 minutes", "7 does not divide 60")

    expect(error.message).toBe(
      'Invalid cron phrase: 7 does not divide 60. Received: "every 7 minutes"'
    )
  })

  it("should describe an input that is not a string", () => {
    expect(new InvalidCronPhraseError(15, "reason").message).toBe(
      "Invalid cron phrase: reason. Received: 15"
    )
    expect(new InvalidCronPhraseError(null, "reason").message).toBe(
      "Invalid cron phrase: reason. Received: null"
    )
  })

  it("should not fail for an input that cannot become a string", () => {
    const input = Object.create(null) as object

    expect(new InvalidCronPhraseError(input, "reason").message).toBe(
      "Invalid cron phrase: reason. Received: [object Object]"
    )
  })

  it("should store any input value without a change", () => {
    fc.assert(
      fc.property(fc.anything(), (value) => {
        expect(new InvalidCronPhraseError(value, "reason").value).toBe(value)
      })
    )
  })
})
