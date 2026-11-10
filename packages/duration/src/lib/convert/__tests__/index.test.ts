import { UNITS } from "@sanely/core/time"
import fc from "fast-check"
import { describe, expect, it } from "vitest"
import {
  convert,
  days,
  hours,
  minutes,
  months,
  ms,
  seconds,
  weeks,
  years,
} from "#lib/convert/index.ts"
import { InvalidTimeExpressionError } from "#lib/expression/errors.ts"
import { parse } from "#lib/expression/parse.ts"

describe("convert", () => {
  it("should convert generated expressions from unit definitions", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...UNITS),
        fc.constantFrom(...UNITS),
        fc.integer({ max: 999, min: -999 }),
        (inputUnit, outputUnit, count) => {
          const expression = `${count}${inputUnit.short}`

          expect(convert(expression, outputUnit.longPlural)).toBe(
            (count * inputUnit.ms) / outputUnit.ms
          )
        }
      )
    )
  })

  it("should convert simple expressions into the given unit", () => {
    expect(convert("90s", "minutes")).toBe(1.5)
    expect(convert("1h", "seconds")).toBe(3600)
    expect(convert("1w", "days")).toBe(7)
  })

  it("should convert compound expressions into the given unit", () => {
    expect(convert("1h 30m", "minutes")).toBe(90)
    expect(convert("1 day, 6 hours", "hours")).toBe(30)
    expect(convert("-1h 30m", "minutes")).toBe(-90)
  })

  it("should interpret a bare number as milliseconds when the output is milliseconds", () => {
    expect(convert("100", "milliseconds")).toBe(100)
  })

  it.each(UNITS.filter((unit) => unit.longPlural !== "milliseconds"))(
    "should reject a bare number when the output is $longPlural",
    ({ longPlural }) => {
      expect(() => convert("30", longPlural)).toThrow(
        new InvalidTimeExpressionError(
          "30",
          'a number without a unit means milliseconds. Add a unit, such as "30s" or "30ms"'
        )
      )
    }
  )

  it("should throw a RangeError for unknown unit names", () => {
    expect(() => convert("1h", "fortnights" as never)).toThrow(RangeError)
    expect(() => convert("1h", "s" as never)).toThrow(RangeError)
  })

  it("should throw for invalid expressions", () => {
    expect(() => convert("foo", "seconds")).toThrow(InvalidTimeExpressionError)
    expect(() => convert("", "seconds")).toThrow(InvalidTimeExpressionError)
  })
})

describe("ms", () => {
  it("should return milliseconds for simple expressions", () => {
    expect(ms("1s")).toBe(1000)
    expect(ms("5m")).toBe(300_000)
    expect(ms("1h")).toBe(3_600_000)
    expect(ms("100")).toBe(100)
  })

  it("should throw for invalid input", () => {
    expect(() => ms("" as never)).toThrow(InvalidTimeExpressionError)
    expect(() => ms("foo" as never)).toThrow(InvalidTimeExpressionError)
  })
})

describe("seconds", () => {
  it("should convert to seconds", () => {
    expect(seconds("1h")).toBe(3600)
    expect(seconds("500ms")).toBe(0.5)
    expect(seconds("1m")).toBe(60)
  })

  it("should reject a bare number, which means milliseconds", () => {
    expect(() => seconds("30" as never)).toThrow(InvalidTimeExpressionError)
  })

  it("should throw for invalid input", () => {
    expect(() => seconds("" as never)).toThrow(InvalidTimeExpressionError)
    expect(() => seconds("☃" as never)).toThrow(InvalidTimeExpressionError)
  })
})

describe("minutes", () => {
  it("should convert to minutes", () => {
    expect(minutes("2h")).toBe(120)
    expect(minutes("30s")).toBe(0.5)
    expect(minutes("1d")).toBe(1440)
  })

  it("should throw for invalid input", () => {
    expect(() => minutes(null as never)).toThrow(InvalidTimeExpressionError)
  })
})

describe("hours", () => {
  it("should convert to hours", () => {
    expect(hours("1d")).toBe(24)
    expect(hours("30m")).toBe(0.5)
    expect(hours("1w")).toBe(168)
  })

  it("should agree with parse for compound expressions", () => {
    expect(convert("1w 2d", "hours")).toBe(216)
    expect(parse("1w 2d") / 3_600_000).toBe(216)
  })

  it("should throw for invalid input", () => {
    expect(() => hours("bar" as never)).toThrow(InvalidTimeExpressionError)
  })
})

describe("days", () => {
  it("should convert to days", () => {
    expect(days("1w")).toBe(7)
    expect(days("12h")).toBe(0.5)
    expect(days("48h")).toBe(2)
  })
})

describe("weeks", () => {
  it("should convert to weeks", () => {
    expect(weeks("14d")).toBe(2)
    expect(weeks("1y")).toBeCloseTo(365.25 / 7, 12)
  })
})

describe("months", () => {
  it("should convert to months", () => {
    expect(months("1y")).toBe(12)
  })
})

describe("years", () => {
  it("should convert to years", () => {
    expect(years("365.25d")).toBeCloseTo(1)
    expect(years("6mo")).toBeCloseTo(0.5)
  })
})
