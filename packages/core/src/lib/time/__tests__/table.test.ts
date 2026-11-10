import { describe, expect, it } from "vitest"
import { findUnit, getAmbiguousUnitHint, getUnitByName, UNITS } from "#lib/time/table.ts"

describe("findUnit", () => {
  it.each([
    ["ms", 1],
    ["msec", 1],
    ["s", 1000],
    ["m", 60_000],
    ["min", 60_000],
    ["h", 3_600_000],
    ["hr", 3_600_000],
    ["d", 86_400_000],
    ["w", 604_800_000],
    ["mo", 2_629_800_000],
    ["y", 31_557_600_000],
  ])("should resolve %s to %d milliseconds", (token, expected) => {
    expect(findUnit(token)?.ms).toBe(expected)
  })

  it.each([
    ["HOURS", "hours"],
    ["Hour", "hours"],
    ["MiNs", "minutes"],
    ["MO", "months"],
    ["Mo", "months"],
    ["MS", "milliseconds"],
    ["H", "hours"],
    ["Hours", "hours"],
    ["MiLliSeCondS", "milliseconds"],
  ])("should ignore the case of %s", (token, name) => {
    expect(findUnit(token)?.longPlural).toBe(name)
  })

  it("should reject M, which reads as months in other notations", () => {
    expect(findUnit("M")).toBeUndefined()
    expect(getAmbiguousUnitHint("M")).toBe('use "m" for minutes or "mo" for months')
  })

  it.each(["m", "MO", "h", "hasOwnProperty"])("should give no hint for %j", (token) => {
    expect(getAmbiguousUnitHint(token)).toBeUndefined()
  })

  it.each(["", "parsec", "PARSEC", "toString", "__proto__", "__PROTO__", "hasOwnProperty"])(
    "should reject an unsupported token: %j",
    (token) => {
      expect(findUnit(token)).toBeUndefined()
    }
  )
})

describe("getUnitByName", () => {
  it("should resolve a long plural name to its formatting and conversion definition", () => {
    expect(getUnitByName("hours")).toEqual({
      aliases: ["hours", "hour", "hrs", "hr", "h"],
      long: "hour",
      longPlural: "hours",
      ms: 3_600_000,
      short: "h",
    })
  })

  it.each(["hour", "h", "HOURS", "parsecs", "toString"])(
    "should reject a name outside the long plural names: %j",
    (name) => {
      expect(getUnitByName(name)).toBeUndefined()
    }
  )
})

describe("UNITS", () => {
  it("should give each alias exactly one unit", () => {
    const aliases = UNITS.flatMap((unit) => unit.aliases)

    expect(new Set(aliases).size).toBe(aliases.length)
  })

  it("should order units from largest to smallest for duration formatting", () => {
    const sizes = UNITS.map((unit) => unit.ms)

    expect(sizes).toEqual(sizes.toSorted((a, b) => b - a))
  })
})
