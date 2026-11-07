import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { scheduleArb } from "#lib/schedule/__tests__/index.arbitrary.ts"
import { ParseError } from "#lib/schedule/rules.ts"
import { validate } from "#lib/validate/index.ts"
import { INVALID_OBJECTS, VALID_OBJECTS } from "./index.table.ts"

describe("validate", () => {
  it.each(VALID_OBJECTS)("should read %j", (value, expected) => {
    expect(validate(value)).toStrictEqual(expected)
  })

  it.each(INVALID_OBJECTS)("should reject %j with %j", (value, reason, path) => {
    expect(() => validate(value)).toThrow(ParseError)
    expect(() => validate(value)).toThrow(expect.objectContaining({ path }))
    expect(() => validate(value)).toThrow(reason)
  })

  it("should read every schedule without a change", () => {
    fc.assert(
      fc.property(scheduleArb, (schedule) => {
        expect(validate(schedule)).toStrictEqual(schedule)
      })
    )
  })
})
