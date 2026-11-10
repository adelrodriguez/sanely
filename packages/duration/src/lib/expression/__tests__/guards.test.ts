import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { isTimeExpression, isValidTimeExpression } from "#lib/expression/guards.ts"
import { safeParse } from "#lib/expression/parse.ts"

describe("guard properties", () => {
  it("should agree with safeParse for arbitrary strings", () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        expect(isValidTimeExpression(value)).toBe(safeParse(value) !== null)

        if (isTimeExpression(value)) {
          expect(safeParse(value)).not.toBeNull()
        }
      })
    )
  })

  it("should never allow safeParse to return a non-finite number", () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        const parsed = safeParse(value)

        expect(parsed === null || Number.isFinite(parsed)).toBe(true)
      })
    )
  })
})

describe("isTimeExpression", () => {
  it("should return true for valid strict expressions", () => {
    expect(isTimeExpression("1h")).toBe(true)
    expect(isTimeExpression("500ms")).toBe(true)
    expect(isTimeExpression("2.5d")).toBe(true)
    expect(isTimeExpression("100")).toBe(true)
    expect(isTimeExpression("1 second")).toBe(true)
    expect(isTimeExpression(".5ms")).toBe(true)
    expect(isTimeExpression("-1h")).toBe(true)
    expect(isTimeExpression("+1h")).toBe(true)
    expect(isTimeExpression("1e3ms")).toBe(true)
  })

  it("should accept the casing variants the type accepts", () => {
    expect(isTimeExpression("1H")).toBe(true)
    expect(isTimeExpression("1 Hour")).toBe(true)
    expect(isTimeExpression("1 HOUR")).toBe(true)
    expect(isTimeExpression("1Ms")).toBe(true)
  })

  it("should reject M, which the type also rejects", () => {
    expect(isTimeExpression("1M")).toBe(false)
    expect(isTimeExpression("1 M")).toBe(false)
  })

  it("should reject mixed casing outside the type", () => {
    expect(isTimeExpression("1mS")).toBe(false)
    expect(isTimeExpression("1 HoUr")).toBe(false)
  })

  it("should return false for compound expressions", () => {
    expect(isTimeExpression("1h 30m")).toBe(false)
    expect(isTimeExpression("1 day, 6 hours")).toBe(false)
    expect(isTimeExpression("1h, 30m, 15s")).toBe(false)
    expect(isTimeExpression("1h30m")).toBe(false)
  })

  it("should return false for invalid strings", () => {
    expect(isTimeExpression("hello")).toBe(false)
    expect(isTimeExpression("abc123")).toBe(false)
    expect(isTimeExpression("☃")).toBe(false)
    expect(isTimeExpression("ms")).toBe(false)
    expect(isTimeExpression("foo")).toBe(false)
  })

  it("should return false for whitespace forms outside the strict grammar", () => {
    expect(isTimeExpression(" 1h")).toBe(false)
    expect(isTimeExpression("1h ")).toBe(false)
    expect(isTimeExpression("1  hour")).toBe(false)
    expect(isTimeExpression("1\thour")).toBe(false)
  })

  it("should return false for expressions that overflow to non-finite values", () => {
    expect(isTimeExpression("1e309ms")).toBe(false)
    expect(isTimeExpression("-1e309ms")).toBe(false)
    expect(isTimeExpression("1e400y")).toBe(false)
    expect(isTimeExpression("1e308y")).toBe(false)
  })

  it("should return false for empty string", () => {
    expect(isTimeExpression("")).toBe(false)
  })

  it("should return false for a strict expression longer than 200 characters", () => {
    const value = `${"1".repeat(200)}h`

    expect(value).toHaveLength(201)
    expect(isTimeExpression(value)).toBe(false)
    expect(isTimeExpression(value.slice(1))).toBe(true)
  })

  it("should return false for non-string inputs at runtime", () => {
    expect(isTimeExpression(undefined as never)).toBe(false)
    expect(isTimeExpression(null as never)).toBe(false)
    expect(isTimeExpression(123 as never)).toBe(false)
    expect(isTimeExpression([] as never)).toBe(false)
    expect(isTimeExpression({} as never)).toBe(false)
  })
})

describe("isValidTimeExpression", () => {
  it("should return true for valid simple expressions", () => {
    expect(isValidTimeExpression("1h")).toBe(true)
    expect(isValidTimeExpression("500ms")).toBe(true)
    expect(isValidTimeExpression("2.5d")).toBe(true)
    expect(isValidTimeExpression("100")).toBe(true)
    expect(isValidTimeExpression("1 second")).toBe(true)
    expect(isValidTimeExpression(".5ms")).toBe(true)
  })

  it("should return false for invalid strings", () => {
    expect(isValidTimeExpression("hello")).toBe(false)
    expect(isValidTimeExpression("abc123")).toBe(false)
    expect(isValidTimeExpression("☃")).toBe(false)
    expect(isValidTimeExpression("ms")).toBe(false)
    expect(isValidTimeExpression(",1h")).toBe(false)
    expect(isValidTimeExpression("1h,")).toBe(false)
    expect(isValidTimeExpression("1h,,30m")).toBe(false)
    expect(isValidTimeExpression("1h, ,30m")).toBe(false)
  })
})
