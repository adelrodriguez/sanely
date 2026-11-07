import { describe, expect, it } from "vitest"
import {
  DAY_GROUPS,
  DAYS,
  HOUR_INTERVALS,
  LAST_DAY_OF_MONTH,
  MINUTE_INTERVALS,
  WEEKDAYS,
  formatChoices,
  getOrdinalSuffix,
  isDayOfMonth,
  isHour,
  isMinute,
  isNonEmpty,
  isOneOf,
  isWeekday,
  isWindowEnd,
} from "#lib/vocabulary/words.ts"

describe("WEEKDAYS", () => {
  it("should list the days in calendar order, Monday first", () => {
    expect(WEEKDAYS).toEqual([
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ])
  })
})

describe("DAYS", () => {
  it("should use the cron day numbers, with 0 for Sunday", () => {
    expect(WEEKDAYS.map((day) => DAYS[day].cron)).toEqual([1, 2, 3, 4, 5, 6, 0])
  })

  it("should give each alias exactly one day", () => {
    const aliases: readonly string[] = WEEKDAYS.flatMap((day) => DAYS[day].aliases)

    expect(new Set(aliases).size).toBe(aliases.length)
    expect(aliases.filter((alias) => isWeekday(alias))).toEqual([])
  })
})

describe("DAY_GROUPS", () => {
  it("should select Monday to Friday and the weekend", () => {
    expect(DAY_GROUPS).toEqual({
      weekdays: {
        days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
        singular: "weekday",
      },
      weekends: { days: ["saturday", "sunday"], singular: "weekend" },
    })
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

  it("should stop the days of the month at the last day that occurs in every month", () => {
    expect(LAST_DAY_OF_MONTH).toBe(28)
  })
})

describe("guards", () => {
  const SAMPLES = [-1, 0, 0.5, 1, 12, 23, 24, 28, 29, 59, 60, Number.NaN, "1", null, undefined]

  it.each([
    ["isHour", isHour, [0, 1, 12, 23]],
    ["isMinute", isMinute, [0, 1, 12, 23, 24, 28, 29, 59]],
    ["isWindowEnd", isWindowEnd, [1, 12, 23, 24]],
    ["isDayOfMonth", isDayOfMonth, [1, 12, 23, 24, 28]],
  ] as const)("%s should accept only whole numbers in its range", (_, guard, accepted) => {
    expect(SAMPLES.filter((value) => guard(value))).toEqual(accepted)
  })

  it("should accept only the day names in isWeekday", () => {
    expect(WEEKDAYS.every((day) => isWeekday(day))).toBe(true)
    expect(["Monday", "mon", "weekday", "", 1, null].some((value) => isWeekday(value))).toBe(false)
  })

  it("should accept only a list with one or more values in isNonEmpty", () => {
    expect(isNonEmpty([])).toBe(false)
    expect(isNonEmpty(["monday"])).toBe(true)
  })

  it("should accept only a member of the list in isOneOf", () => {
    expect(isOneOf(MINUTE_INTERVALS, 15)).toBe(true)
    expect(isOneOf(MINUTE_INTERVALS, "15")).toBe(false)
    expect(isOneOf(MINUTE_INTERVALS, 7)).toBe(false)
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
