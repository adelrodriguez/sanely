import { describe, expect, it } from "vitest"
import {
  ParseError,
  fail,
  toHourInterval,
  toMinuteInterval,
  toWindow,
} from "#lib/schedule/rules.ts"

describe("fail", () => {
  it("should throw a ParseError with the reason and the path", () => {
    let caught: unknown
    try {
      fail("the key is required", ["at"])
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(ParseError)
    expect(caught).toMatchObject({ path: ["at"], reason: "the key is required" })
  })
})

describe("toMinuteInterval", () => {
  it("should accept each divisor of 60 from 2 to 30", () => {
    for (const value of [2, 3, 4, 5, 6, 10, 12, 15, 20, 30]) {
      expect(toMinuteInterval(value)).toBe(value)
    }
  })

  it("should name the cycle for an interval below it, and list the choices", () => {
    expect(() => toMinuteInterval(7)).toThrow(
      "7 does not divide 60. Use 2, 3, 4, 5, 6, 10, 12, 15, 20, or 30"
    )
  })

  it("should name the unit for an interval above the cycle", () => {
    expect(() => toMinuteInterval(90)).toThrow("90 minutes has no exact single cron")
  })

  it("should keep the path in the issue", () => {
    expect(() => toMinuteInterval(7, ["interval"])).toThrow(
      expect.objectContaining({ path: ["interval"] })
    )
  })
})

describe("toHourInterval", () => {
  it("should accept each divisor of 24 from 2 to 12", () => {
    for (const value of [2, 3, 4, 6, 8, 12]) expect(toHourInterval(value)).toBe(value)
  })

  it("should reject other intervals with a reason", () => {
    expect(() => toHourInterval(5)).toThrow("5 does not divide 24. Use 2, 3, 4, 6, 8, or 12")
    expect(() => toHourInterval(36)).toThrow("36 hours has no exact single cron")
  })
})

describe("toWindow", () => {
  it("should accept a window that ends after it starts", () => {
    expect(toWindow(9, 17)).toEqual({ from: 9, to: 17 })
    expect(toWindow(23, 24)).toEqual({ from: 23, to: 24 })
  })

  it("should reject a window that ends at or before its start", () => {
    expect(() => toWindow(9, 9)).toThrow("the window must end after it starts")
    expect(() => toWindow(17, 9, ["between"])).toThrow(
      expect.objectContaining({ path: ["between"] })
    )
  })
})
