/**
 * The day names in calendar order (Monday first), with the cron day-of-week number of each day.
 * Cron uses 0 for Sunday.
 */
export const DAYS = [
  { aliases: ["mon", "mondays"], cron: 1, name: "monday" },
  { aliases: ["tue", "tues", "tuesdays"], cron: 2, name: "tuesday" },
  { aliases: ["wed", "weds", "wednesdays"], cron: 3, name: "wednesday" },
  { aliases: ["thu", "thur", "thurs", "thursdays"], cron: 4, name: "thursday" },
  { aliases: ["fri", "fridays"], cron: 5, name: "friday" },
  { aliases: ["sat", "saturdays"], cron: 6, name: "saturday" },
  { aliases: ["sun", "sundays"], cron: 0, name: "sunday" },
] as const

/**
 * The day groups. A day group stands alone: it is never part of a list of days. After `every` the
 * strict form uses the singular word, and after `on` it uses the plural word.
 */
export const DAY_GROUPS = [
  { cron: [1, 2, 3, 4, 5], plural: "weekdays", singular: "weekday" },
  { cron: [0, 6], plural: "weekends", singular: "weekend" },
] as const

/**
 * Minute intervals with an exact cron: the divisors of 60. An interval of 1 is `every minute`.
 */
export const MINUTE_INTERVALS: readonly number[] = [2, 3, 4, 5, 6, 10, 12, 15, 20, 30]

/**
 * Hour intervals with an exact cron: the divisors of 24. An interval of 1 is `every hour`.
 */
export const HOUR_INTERVALS: readonly number[] = [2, 3, 4, 6, 8, 12]

/**
 * The highest day of the month in the language. Days 29 to 31 do not occur in every month.
 */
export const MAX_ORDINAL = 28

/**
 * Interval units and their aliases. The aliases are a copy of the minute and hour rows of the
 * Humanspan unit table, so that an alias never means different units in the two packages. The
 * singular word follows `every`, and the plural word follows a number.
 */
export const UNITS = [
  { aliases: ["minutes", "minute", "mins", "min", "m"], plural: "minutes", singular: "minute" },
  { aliases: ["hours", "hour", "hrs", "hr", "h"], plural: "hours", singular: "hour" },
] as const

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
 * Format a list of numbers the way the reasons in error messages do: `2, 3, or 4`.
 */
export function formatChoices(values: readonly number[]): string {
  const head = values.slice(0, -1).join(", ")
  return `${head}, or ${values.at(-1)}`
}
