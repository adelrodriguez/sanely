import { MS_PER_HOUR, MS_PER_MINUTE, safeParse } from "humanspan"
import { describe, expect, it } from "vitest"
import {
  DAY_GROUPS,
  DAYS,
  HOUR_INTERVALS,
  MAX_ORDINAL,
  MINUTE_INTERVALS,
  UNITS,
  formatChoices,
  getOrdinalSuffix,
} from "#lib/vocabulary/words.ts"

// Every unit alias in the Humanspan unit table.
const HUMANSPAN_ALIASES = [
  "years",
  "year",
  "yrs",
  "yr",
  "y",
  "months",
  "month",
  "mo",
  "weeks",
  "week",
  "w",
  "days",
  "day",
  "d",
  "hours",
  "hour",
  "hrs",
  "hr",
  "h",
  "minutes",
  "minute",
  "mins",
  "min",
  "m",
  "seconds",
  "second",
  "secs",
  "sec",
  "s",
  "milliseconds",
  "millisecond",
  "msecs",
  "msec",
  "ms",
]

describe("DAYS", () => {
  it("should list the days in calendar order, Monday first", () => {
    expect(DAYS.map((day) => day.name)).toEqual([
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ])
  })

  it("should use the cron day numbers, with 0 for Sunday", () => {
    expect(DAYS.map((day) => day.cron)).toEqual([1, 2, 3, 4, 5, 6, 0])
  })

  it("should give each alias exactly one day", () => {
    const aliases: readonly string[] = DAYS.flatMap((day) => day.aliases)

    expect(new Set(aliases).size).toBe(aliases.length)
    expect(aliases.filter((alias) => DAYS.some((day) => day.name === alias))).toEqual([])
  })
})

describe("DAY_GROUPS", () => {
  it("should select Monday to Friday and the weekend", () => {
    expect(DAY_GROUPS.map((group) => [group.singular, group.plural, group.cron])).toEqual([
      ["weekday", "weekdays", [1, 2, 3, 4, 5]],
      ["weekend", "weekends", [0, 6]],
    ])
  })
})

describe("intervals", () => {
  it("should contain exactly the divisors of 60 from 2 to 30", () => {
    const divisors = Array.from({ length: 29 }, (_, index) => index + 2).filter(
      (value) => 60 % value === 0
    )

    expect(MINUTE_INTERVALS).toEqual(divisors)
  })

  it("should contain exactly the divisors of 24 from 2 to 12", () => {
    const divisors = Array.from({ length: 11 }, (_, index) => index + 2).filter(
      (value) => 24 % value === 0
    )

    expect(HOUR_INTERVALS).toEqual(divisors)
  })

  it("should stop the ordinals at the last day that occurs in every month", () => {
    expect(MAX_ORDINAL).toBe(28)
  })
})

describe("UNITS", () => {
  it("should map the minute and hour aliases to their unit", () => {
    expect(UNITS.map((unit) => [unit.plural, unit.aliases])).toEqual([
      ["minutes", ["minutes", "minute", "mins", "min", "m"]],
      ["hours", ["hours", "hour", "hrs", "hr", "h"]],
    ])
  })

  it("should give each alias exactly one unit", () => {
    const aliases = UNITS.flatMap((unit) => unit.aliases)

    expect(new Set(aliases).size).toBe(aliases.length)
  })

  const unitByAlias: ReadonlyMap<string, string> = new Map(
    UNITS.flatMap((unit) => unit.aliases.map((alias) => [alias, unit.plural] as const))
  )

  for (const alias of HUMANSPAN_ALIASES) {
    it(`should give "${alias}" the same unit as Humanspan`, () => {
      const milliseconds = safeParse(`2${alias}`)
      expect(milliseconds).not.toBeNull()

      expect(unitByAlias.get(alias) === "minutes").toBe(milliseconds === 2 * MS_PER_MINUTE)
      expect(unitByAlias.get(alias) === "hours").toBe(milliseconds === 2 * MS_PER_HOUR)
    })
  }

  it("should contain no alias that Humanspan does not have", () => {
    expect([...unitByAlias.keys()].filter((alias) => !HUMANSPAN_ALIASES.includes(alias))).toEqual(
      []
    )
  })
})

describe("getOrdinalSuffix", () => {
  it("should return the English suffix", () => {
    const ordinals = Array.from(
      { length: 31 },
      (_, index) => `${index + 1}${getOrdinalSuffix(index + 1)}`
    )

    expect(ordinals).toEqual([
      "1st",
      "2nd",
      "3rd",
      ...Array.from({ length: 17 }, (_, index) => `${index + 4}th`),
      "21st",
      "22nd",
      "23rd",
      ...Array.from({ length: 7 }, (_, index) => `${index + 24}th`),
      "31st",
    ])
  })
})

describe("formatChoices", () => {
  it("should list the values with a comma before the last one", () => {
    expect(formatChoices([2, 3, 4])).toBe("2, 3, or 4")
    expect(formatChoices(MINUTE_INTERVALS)).toBe("2, 3, 4, 5, 6, 10, 12, 15, 20, or 30")
  })
})
