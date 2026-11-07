import fc from "fast-check"
import type { DaySet, Schedule, Time, Window } from "#lib/schedule/schedule.ts"
import { isWindow } from "#lib/schedule/schedule.ts"
import {
  HOUR_INTERVALS,
  MINUTE_INTERVALS,
  WEEKDAYS,
  isDayOfMonth,
  isHour,
  isMinute,
  isNonEmpty,
  isWindowEnd,
} from "#lib/vocabulary/words.ts"

const hourArb = fc.integer({ max: 23, min: 0 }).filter((value) => isHour(value))
const minuteArb = fc.integer({ max: 59, min: 0 }).filter((value) => isMinute(value))

export const timeArb: fc.Arbitrary<Time> = fc.record(
  { hour: hourArb, minute: minuteArb },
  { noNullPrototype: true }
)

// A window on whole hours. The end is not included, and 24 is the end of the day.
export const windowArb: fc.Arbitrary<Window> = hourArb.chain((from) =>
  fc
    .integer({ max: 24, min: from + 1 })
    .filter((to) => isWindowEnd(to))
    .map((to) => ({ from, to }))
    .filter((window) => isWindow(window))
)

// A day group, or a list of days in any order and with duplicates.
export const daySetArb: fc.Arbitrary<DaySet> = fc.oneof(
  fc.constant("weekdays"),
  fc.constant("weekends"),
  fc
    .array(fc.constantFrom(...WEEKDAYS), { maxLength: 9, minLength: 1 })
    .filter((days) => isNonEmpty(days))
)

const dayOfMonthArb = fc.integer({ max: 28, min: 1 }).filter((value) => isDayOfMonth(value))

/**
 * Any schedule. Each optional key is present or absent.
 */
export const scheduleArb: fc.Arbitrary<Schedule> = fc.oneof(
  fc.record(
    {
      between: windowArb,
      every: fc.constant("minute"),
      interval: fc.constantFrom(...MINUTE_INTERVALS),
      on: daySetArb,
    },
    { noNullPrototype: true, requiredKeys: ["every"] }
  ),
  fc.record(
    { every: fc.constant("hour"), interval: fc.constantFrom(...HOUR_INTERVALS), on: daySetArb },
    { noNullPrototype: true, requiredKeys: ["every"] }
  ),
  fc.record(
    { at: timeArb, every: fc.constant("day"), on: daySetArb },
    {
      noNullPrototype: true,
      requiredKeys: ["at", "every"],
    }
  ),
  fc.record(
    { at: timeArb, day: dayOfMonthArb, every: fc.constant("month") },
    { noNullPrototype: true }
  )
)
