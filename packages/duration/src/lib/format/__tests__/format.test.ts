import { describe, expect, it } from "vitest"
import { format } from "#lib/format/format.ts"
import { MS_PER_DAY, MS_PER_MINUTE, MS_PER_WEEK } from "#lib/units/constants.ts"

describe("format", () => {
  it("should format milliseconds (short)", () => {
    expect(format(500)).toBe("500ms")
    expect(format(-500)).toBe("-500ms")
  })

  it("should round sub-millisecond values at precision 1", () => {
    expect(format(0.4)).toBe("0ms")
    expect(format(-0.4)).toBe("0ms")
    expect(format(0.4, { long: true })).toBe("0 milliseconds")
  })

  it("should round the smallest unit when precision exceeds the available segments", () => {
    expect(format(1.50000000000001, { precision: 2 })).toBe("2ms")
    expect(format(-1.50000000000001, { precision: 2 })).toBe("-2ms")
  })

  it("should format seconds (short)", () => {
    expect(format(1000)).toBe("1s")
    expect(format(10_000)).toBe("10s")
    expect(format(-1000)).toBe("-1s")
    expect(format(-10_000)).toBe("-10s")
  })

  it("should format minutes (short)", () => {
    expect(format(60_000)).toBe("1m")
    expect(format(600_000)).toBe("10m")
    expect(format(-60_000)).toBe("-1m")
    expect(format(-600_000)).toBe("-10m")
  })

  it("should format hours (short)", () => {
    expect(format(3_600_000)).toBe("1h")
    expect(format(36_000_000)).toBe("10h")
    expect(format(-3_600_000)).toBe("-1h")
    expect(format(-36_000_000)).toBe("-10h")
  })

  it("should format days (short)", () => {
    expect(format(86_400_000)).toBe("1d")
    expect(format(518_400_000)).toBe("6d")
    expect(format(-86_400_000)).toBe("-1d")
    expect(format(-518_400_000)).toBe("-6d")
  })

  it("should format weeks (short)", () => {
    expect(format(604_800_000)).toBe("1w")
    expect(format(1_209_600_000)).toBe("2w")
    expect(format(-604_800_000)).toBe("-1w")
    expect(format(-1_209_600_000)).toBe("-2w")
  })

  it("should format months (short)", () => {
    expect(format(30.4375 * 24 * 60 * 60 * 1000)).toBe("1mo")
    expect(format(30.4375 * 24 * 60 * 60 * 1200)).toBe("1mo")
    expect(format(30.4375 * 24 * 60 * 60 * 10_000)).toBe("10mo")
    expect(format(-30.4375 * 24 * 60 * 60 * 1000)).toBe("-1mo")
    expect(format(-30.4375 * 24 * 60 * 60 * 1200)).toBe("-1mo")
    expect(format(-30.4375 * 24 * 60 * 60 * 10_000)).toBe("-10mo")
  })

  it("should format years (short)", () => {
    expect(format(365.25 * 24 * 60 * 60 * 1000 + 1)).toBe("1y")
    expect(format(365.25 * 24 * 60 * 60 * 1200 + 1)).toBe("1y")
    expect(format(365.25 * 24 * 60 * 60 * 10_000 + 1)).toBe("10y")
    expect(format(-365.25 * 24 * 60 * 60 * 1000 - 1)).toBe("-1y")
    expect(format(-365.25 * 24 * 60 * 60 * 1200 - 1)).toBe("-1y")
    expect(format(-365.25 * 24 * 60 * 60 * 10_000 - 1)).toBe("-10y")
  })

  it("should round to the nearest unit", () => {
    expect(format(1500)).toBe("2s")
    expect(format(234_234_234)).toBe("3d")
    expect(format(-234_234_234)).toBe("-3d")
  })

  it("should carry into the next unit when rounding reaches its boundary", () => {
    expect(format(59_999)).toBe("1m")
    expect(format(-59_999)).toBe("-1m")
    expect(format(999.5)).toBe("1s")
    expect(format(59.7 * MS_PER_MINUTE)).toBe("1h")
    expect(format(364 * MS_PER_DAY)).toBe("1y")
    expect(format(59_999, { long: true })).toBe("1 minute")
  })

  it("should format milliseconds (long)", () => {
    expect(format(500, { long: true })).toBe("500 milliseconds")
    expect(format(-500, { long: true })).toBe("-500 milliseconds")
  })

  it("should format seconds with correct pluralization (long)", () => {
    expect(format(1000, { long: true })).toBe("1 second")
    expect(format(1200, { long: true })).toBe("1 second")
    expect(format(10_000, { long: true })).toBe("10 seconds")
    expect(format(-1000, { long: true })).toBe("-1 second")
    expect(format(-1200, { long: true })).toBe("-1 second")
    expect(format(-10_000, { long: true })).toBe("-10 seconds")
  })

  it("should format minutes with correct pluralization (long)", () => {
    expect(format(60_000, { long: true })).toBe("1 minute")
    expect(format(72_000, { long: true })).toBe("1 minute")
    expect(format(600_000, { long: true })).toBe("10 minutes")
    expect(format(-60_000, { long: true })).toBe("-1 minute")
    expect(format(-72_000, { long: true })).toBe("-1 minute")
    expect(format(-600_000, { long: true })).toBe("-10 minutes")
  })

  it("should format hours with correct pluralization (long)", () => {
    expect(format(3_600_000, { long: true })).toBe("1 hour")
    expect(format(4_320_000, { long: true })).toBe("1 hour")
    expect(format(36_000_000, { long: true })).toBe("10 hours")
    expect(format(-3_600_000, { long: true })).toBe("-1 hour")
    expect(format(-4_320_000, { long: true })).toBe("-1 hour")
    expect(format(-36_000_000, { long: true })).toBe("-10 hours")
  })

  it("should format days with correct pluralization (long)", () => {
    expect(format(86_400_000, { long: true })).toBe("1 day")
    expect(format(103_680_000, { long: true })).toBe("1 day")
    expect(format(518_400_000, { long: true })).toBe("6 days")
    expect(format(-86_400_000, { long: true })).toBe("-1 day")
    expect(format(-103_680_000, { long: true })).toBe("-1 day")
    expect(format(-518_400_000, { long: true })).toBe("-6 days")
  })

  it("should format weeks with correct pluralization (long)", () => {
    expect(format(604_800_000, { long: true })).toBe("1 week")
    expect(format(1_209_600_000, { long: true })).toBe("2 weeks")
    expect(format(-604_800_000, { long: true })).toBe("-1 week")
    expect(format(-1_209_600_000, { long: true })).toBe("-2 weeks")
  })

  it("should format months with correct pluralization (long)", () => {
    expect(format(30.4375 * 24 * 60 * 60 * 1000, { long: true })).toBe("1 month")
    expect(format(30.4375 * 24 * 60 * 60 * 1200, { long: true })).toBe("1 month")
    expect(format(30.4375 * 24 * 60 * 60 * 10_000, { long: true })).toBe("10 months")
    expect(format(-30.4375 * 24 * 60 * 60 * 1000, { long: true })).toBe("-1 month")
    expect(format(-30.4375 * 24 * 60 * 60 * 1200, { long: true })).toBe("-1 month")
    expect(format(-30.4375 * 24 * 60 * 60 * 10_000, { long: true })).toBe("-10 months")
  })

  it("should format years with correct pluralization (long)", () => {
    expect(format(365.25 * 24 * 60 * 60 * 1000 + 1, { long: true })).toBe("1 year")
    expect(format(365.25 * 24 * 60 * 60 * 1200 + 1, { long: true })).toBe("1 year")
    expect(format(365.25 * 24 * 60 * 60 * 10_000 + 1, { long: true })).toBe("10 years")
    expect(format(-365.25 * 24 * 60 * 60 * 1000 - 1, { long: true })).toBe("-1 year")
    expect(format(-365.25 * 24 * 60 * 60 * 1200 - 1, { long: true })).toBe("-1 year")
    expect(format(-365.25 * 24 * 60 * 60 * 10_000 - 1, { long: true })).toBe("-10 years")
  })

  it("should round in long format", () => {
    expect(format(234_234_234, { long: true })).toBe("3 days")
    expect(format(-234_234_234, { long: true })).toBe("-3 days")
  })

  it("should return 0ms for zero", () => {
    expect(format(0)).toBe("0ms")
    expect(format(0, { precision: 5 })).toBe("0ms")
    expect(format(0, { long: true })).toBe("0 milliseconds")
  })

  it("should match default when precision is 1", () => {
    expect(format(5_432_100, { precision: 1 })).toBe(format(5_432_100))
  })

  it("should decompose into 2 segments with precision 2", () => {
    expect(format(5_432_100, { precision: 2 })).toBe("1h 31m")
  })

  it("should decompose into 3 segments with precision 3", () => {
    expect(format(5_432_100, { precision: 3 })).toBe("1h 30m 32s")
  })

  it("should decompose into 4 segments with precision 4", () => {
    expect(format(5_432_100, { precision: 4 })).toBe("1h 30m 32s 100ms")
  })

  it("should not emit more segments than available", () => {
    expect(format(500, { precision: 10 })).toBe("500ms")
    expect(format(3_600_000, { precision: 5 })).toBe("1h")
  })

  it("should decompose all meaningful segments at high precision", () => {
    expect(format(90_061_100, { precision: 10 })).toBe("1d 1h 1m 1s 100ms")
  })

  it("should combine long format with precision", () => {
    expect(format(5_432_100, { long: true, precision: 2 })).toBe("1 hour 31 minutes")
    expect(format(5_400_000, { long: true, precision: 2 })).toBe("1 hour 30 minutes")
    expect(format(3_601_000, { long: true, precision: 2 })).toBe("1 hour 1 second")
  })

  it("should handle negative values with precision", () => {
    expect(format(-3_600_000)).toBe("-1h")
    expect(format(-5_400_000, { precision: 2 })).toBe("-1h 30m")
    expect(format(-5_400_000, { long: true, precision: 2 })).toBe("-1 hour 30 minutes")
  })

  it("should avoid signed zero when precision rounding collapses to zero", () => {
    expect(format(-0.4, { precision: 2 })).toBe("0ms")
    expect(format(-0.4, { long: true, precision: 2 })).toBe("0 milliseconds")
  })

  it("should carry over when rounding overflows the last segment", () => {
    expect(format(3_599_600, { precision: 2 })).toBe("1h")
  })

  it("should carry over across multiple units", () => {
    expect(format(86_385_000, { precision: 2 })).toBe("1d")
  })

  it("should keep every segment after the first an integer for large values", () => {
    const names = ["years", "months", "weeks", "days", "hours", "minutes", "seconds"] as const
    const values = [2.7241849828496126e25, -5.425569271720871e25, 7.947915127387355e26]

    for (const value of values) {
      for (const units of [
        names,
        ["months", "weeks", "days"],
        ["months", "days", "hours"],
      ] as const) {
        const output = format(value, { precision: 8, units })
        const segments = output.replace(/^-/, "").split(" ").slice(1)

        for (const segment of segments) {
          expect(segment, output).toMatch(/^\d+[a-z]+$/)
        }
      }
    }
  })

  it("should not add a unit to the whole count for large values", () => {
    // Exact BigInt division gives 4_199_437_939_386_556 days and a 24_408_064ms remainder.
    expect(format(3.6283143796299846e23, { precision: 2, units: ["days", "hours"] })).toBe(
      "4199437939386556d 7h"
    )
  })

  it("should throw for NaN", () => {
    expect(() => format(Number.NaN)).toThrow(TypeError)
  })

  it("should throw for Infinity", () => {
    expect(() => format(Number.POSITIVE_INFINITY)).toThrow(TypeError)
  })

  it("should throw for -Infinity", () => {
    expect(() => format(Number.NEGATIVE_INFINITY)).toThrow(TypeError)
  })

  it("should include non-finite values in thrown messages", () => {
    expect(() => format(Number.POSITIVE_INFINITY)).toThrow(/Received: Infinity/)
    expect(() => format(Number.NEGATIVE_INFINITY)).toThrow(/Received: -Infinity/)
    expect(() => format(Number.NaN)).toThrow(/Received: NaN/)
  })

  it("should throw for invalid precision values", () => {
    expect(() => format(1234, { precision: 0 })).toThrow(RangeError)
    expect(() => format(1234, { precision: -1 })).toThrow(RangeError)
    expect(() => format(1234, { precision: Number.NaN })).toThrow(RangeError)
    expect(() => format(1234, { precision: Number.POSITIVE_INFINITY })).toThrow(RangeError)
    expect(() => format(1234, { precision: 2.5 })).toThrow(RangeError)
  })

  it("should round precision-1 ties symmetrically by magnitude", () => {
    expect(format(1500)).toBe("2s")
    expect(format(-1500)).toBe("-2s")
    expect(format(1.5)).toBe("2ms")
    expect(format(-1.5)).toBe("-2ms")
  })

  it("should throw for non-number inputs", () => {
    expect(() => format("100" as never)).toThrow(TypeError)
    expect(() => format(undefined as never)).toThrow(TypeError)
    expect(() => format(null as never)).toThrow(TypeError)
    expect(() => format([] as never)).toThrow(TypeError)
    expect(() => format({} as never)).toThrow(TypeError)
  })

  it("should restrict output to the given units", () => {
    expect(format(12_096_000_000, { units: ["days"] })).toBe("140d")
    expect(format(5 * MS_PER_WEEK, { precision: 2, units: ["weeks", "days"] })).toBe("5w")
    expect(format(90_061_100, { precision: 3, units: ["hours", "minutes", "seconds"] })).toBe(
      "25h 1m 1s"
    )
  })

  it("should ignore the order of the units option", () => {
    expect(format(90_061_100, { precision: 3, units: ["seconds", "hours", "minutes"] })).toBe(
      "25h 1m 1s"
    )
  })

  it("should format zero and sub-unit values with the smallest allowed unit", () => {
    expect(format(0, { units: ["hours"] })).toBe("0h")
    expect(format(1000, { units: ["hours"] })).toBe("0h")
    expect(format(-1000, { units: ["hours"] })).toBe("0h")
  })

  it("should not carry above the largest allowed unit", () => {
    expect(format(3_600_000, { units: ["minutes"] })).toBe("60m")
  })

  it("should combine the units option with long form", () => {
    expect(format(5_400_000, { long: true, precision: 2, units: ["minutes"] })).toBe("90 minutes")
  })

  it("should throw for invalid units options", () => {
    expect(() => format(1000, { units: [] })).toThrow(RangeError)
    expect(() => format(1000, { units: ["fortnights" as never] })).toThrow(RangeError)
    expect(() => format(1000, { units: "seconds" as never })).toThrow(RangeError)
  })
})
