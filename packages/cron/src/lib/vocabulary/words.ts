import { HOURS_PER_DAY, MINUTES_PER_HOUR } from "@sanely/core/time"

/**
 * The day names in calendar order, Monday first.
 */
export const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const

/**
 * A day name. In a cron phrase, the day group `weekday` means Monday to Friday. This type is the
 * set of all seven day names.
 */
export type Weekday = (typeof WEEKDAYS)[number]

/**
 * The cron day-of-week number and the lenient-form aliases of each day. Cron uses 0 for Sunday.
 */
export const DAYS = {
  friday: { aliases: ["fri", "fridays"], cron: 5 },
  monday: { aliases: ["mon", "mondays"], cron: 1 },
  saturday: { aliases: ["sat", "saturdays"], cron: 6 },
  sunday: { aliases: ["sun", "sundays"], cron: 0 },
  thursday: { aliases: ["thu", "thur", "thurs", "thursdays"], cron: 4 },
  tuesday: { aliases: ["tue", "tues", "tuesdays"], cron: 2 },
  wednesday: { aliases: ["wed", "weds", "wednesdays"], cron: 3 },
} as const satisfies Record<Weekday, { aliases: readonly string[]; cron: number }>

/**
 * The day groups, keyed by the plural word, with their days. A day group stands alone: it is never
 * part of a list of days. A schedule and the `on` clause use the plural word. The `every` clause
 * uses the singular word.
 */
export const DAY_GROUPS = {
  weekdays: { days: ["monday", "tuesday", "wednesday", "thursday", "friday"], singular: "weekday" },
  weekends: { days: ["saturday", "sunday"], singular: "weekend" },
} as const satisfies Record<string, { days: readonly Weekday[]; singular: string }>

/**
 * A day group, in the plural word: `"weekdays"` or `"weekends"`.
 */
export type DayGroup = keyof typeof DAY_GROUPS

/**
 * Check that a value is a day group, in the plural word.
 */
export function isDayGroup(value: unknown): value is DayGroup {
  return typeof value === "string" && Object.hasOwn(DAY_GROUPS, value)
}

/**
 * The day groups, in the plural word.
 */
export const DAY_GROUP_NAMES: readonly DayGroup[] = Object.keys(DAY_GROUPS).filter((name) =>
  isDayGroup(name)
)

/**
 * A day group, in the singular word that follows `every`: `"weekday"` or `"weekend"`.
 */
export type SingularDayGroup = (typeof DAY_GROUPS)[DayGroup]["singular"]

/**
 * The last day of the month that a schedule can use. Days 29 to 31 do not occur in every month.
 */
export const LAST_DAY_OF_MONTH = 28

/**
 * The minute intervals with an exact cron: the divisors of 60. A schedule without an interval runs
 * every minute.
 */
export const MINUTE_INTERVALS = [2, 3, 4, 5, 6, 10, 12, 15, 20, 30] as const

/**
 * The hour intervals with an exact cron: the divisors of 24. A schedule without an interval runs
 * every hour.
 */
export const HOUR_INTERVALS = [2, 3, 4, 6, 8, 12] as const

export type MinuteInterval = (typeof MINUTE_INTERVALS)[number]
export type HourInterval = (typeof HOUR_INTERVALS)[number]

// The numbers from 0 to N - 1.
type Enumerate<N extends number, Values extends number[] = []> = Values["length"] extends N
  ? Values[number]
  : Enumerate<N, [...Values, Values["length"]]>

/**
 * An hour of the day, from 0 to 23.
 */
export type Hour = Enumerate<typeof HOURS_PER_DAY>

/**
 * A minute of the hour, from 0 to 59.
 */
export type Minute = Enumerate<typeof MINUTES_PER_HOUR>

/**
 * The end of a window, from 1 to 24. The end is not included, and 24 is midnight at the end of the
 * day.
 */
export type WindowEnd = Exclude<Enumerate<25>, 0>

/**
 * The hours from 0 to `H`, with `H`.
 */
export type HoursTo<H extends Hour> = Enumerate<H> | H

/**
 * A day of the month, from 1 to 28.
 */
export type DayOfMonth = Exclude<Enumerate<29>, 0>

/**
 * The one-word cron phrases.
 */
export const SHORTCUTS = ["hourly", "daily", "weekly", "monthly"] as const

export type Shortcut = (typeof SHORTCUTS)[number]

/**
 * Check that a value is one of a list of values.
 */
export function isOneOf<const T>(values: readonly T[], value: unknown): value is T {
  const candidates: readonly unknown[] = values
  return candidates.includes(value)
}

/**
 * Check that a list has one or more values.
 */
export function isNonEmpty<T>(values: readonly T[]): values is readonly [T, ...T[]] {
  return values.length > 0
}

function isIntegerFrom(value: unknown, first: number, last: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= first && value <= last
}

export function isHour(value: unknown): value is Hour {
  return isIntegerFrom(value, 0, HOURS_PER_DAY - 1)
}

export function isMinute(value: unknown): value is Minute {
  return isIntegerFrom(value, 0, MINUTES_PER_HOUR - 1)
}

export function isWindowEnd(value: unknown): value is WindowEnd {
  return isIntegerFrom(value, 1, HOURS_PER_DAY)
}

export function isDayOfMonth(value: unknown): value is DayOfMonth {
  return isIntegerFrom(value, 1, LAST_DAY_OF_MONTH)
}

export function isWeekday(value: unknown): value is Weekday {
  return isOneOf(WEEKDAYS, value)
}

/**
 * The correct English ordinal suffix for a day of the month.
 */
export function getOrdinalSuffix(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) return "th"
  if (day % 10 === 1) return "st"
  if (day % 10 === 2) return "nd"
  if (day % 10 === 3) return "rd"
  return "th"
}

/**
 * Format a list of choices the way the reasons in error messages do: `2 or 3`, `2, 3, or 4`.
 */
export function formatChoices(values: ReadonlyArray<number | string>): string {
  if (values.length <= 2) return values.join(" or ")
  return `${values.slice(0, -1).join(", ")}, or ${values.at(-1)}`
}
