import type {
  DAY_GROUPS,
  DayGroup,
  DayOfMonth,
  Hour,
  HourInterval,
  HoursAfter,
  Minute,
  MinuteInterval,
  Shortcut,
  Weekday,
} from "#lib/vocabulary/words.ts"

/**
 * A time of day on the 24-hour clock.
 *
 * @example
 *   const time: Time = { hour: 17, minute: 30 }
 */
export type Time = { readonly hour: Hour; readonly minute: Minute }

/**
 * A time range in each day, on whole hours. `from` is included and `to` is not. `to` is after
 * `from`, and `to: 24` is midnight at the end of the day.
 *
 * @example
 *   const window: Window = { from: 9, to: 17 } // 9:00 to 16:59
 */
export type Window = {
  [From in Hour]: { readonly from: From; readonly to: HoursAfter<From> }
}[Hour]

/**
 * The days of the week that a schedule runs on: a day group, or a list of one or more day names. A
 * list is a set: the order and duplicates do not change the schedule.
 *
 * @example
 *   const days: DaySet = ["monday", "friday"]
 */
export type DaySet = DayGroup | readonly [Weekday, ...Weekday[]]

/**
 * A schedule: the set of times that one standard 5-field cron expression selects exactly.
 *
 * - `minute`: every minute, or every `interval` minutes from :00 of each hour. `between` limits the
 *   runs to a window, and `on` limits them to a day set.
 * - `hour`: at :00 of every hour, or of every `interval` hours from 00:00. `on` limits the days.
 * - `day`: at a time each day, or on the days of a day set.
 * - `month`: at a time on one day of the month, from 1 to 28. A month schedule has no day set,
 *   because cron runs on the day of the month or on the day of the week when both are set.
 *
 * @example
 *   const schedule: Schedule = { every: "day", at: { hour: 17, minute: 30 }, on: "weekdays" }
 */
export type Schedule =
  | {
      readonly every: "minute"
      readonly interval?: MinuteInterval
      readonly between?: Window
      readonly on?: DaySet
    }
  | { readonly every: "hour"; readonly interval?: HourInterval; readonly on?: DaySet }
  | { readonly every: "day"; readonly at: Time; readonly on?: DaySet }
  | { readonly every: "month"; readonly day: DayOfMonth; readonly at: Time }

declare const cronExpression: unique symbol

/**
 * A standard 5-field cron expression that `cron` made, such as `"*\/15 9-16 * * 1-5"`. It is a
 * `string`, so a scheduler that takes a `string` accepts it.
 */
export type CronExpression = string & { readonly [cronExpression]: true }

type MinuteBase = "every minute" | `every ${MinuteInterval} minutes`
type HourBase = "every hour" | `every ${HourInterval} hours`

// The first word of the day set after `every`: a day name, or a singular day group.
type FirstDayWord = Weekday | (typeof DAY_GROUPS)[number]["singular"]

/**
 * A cron phrase in the strict form, such as `"every 15 minutes on weekdays"`. `describe` returns
 * one.
 *
 * The sentence shapes, the intervals, and the first word of each slot are exact. The rest of each
 * slot is open: `cron` and `ValidateCronPhrase` check it for a string literal. The open slots keep
 * this union small. TypeScript compares template literal types in pairs when it reduces a union
 * (for example, the type of `[phrase, otherPhrase]`), and reports a large union as "too complex to
 * represent".
 */
export type CronPhrase =
  | Shortcut
  | MinuteBase
  | `${MinuteBase} ${"on" | "between"} ${string}`
  | HourBase
  | `${HourBase} on ${string}`
  | `every day at ${string}`
  | `every ${FirstDayWord}${string} at ${string}`
  | `on the ${DayOfMonth}${string} of every month at ${string}`

/**
 * The kinds of schedule: the values of `every`.
 */
export type Kind = Schedule["every"]

export type ScheduleOf<K extends Kind> = Extract<Schedule, { every: K }>

/**
 * A table with one function for each kind of schedule. Check a table with `satisfies ByKind<R>`, so
 * that a kind without a row does not compile.
 */
export type ByKind<R> = { readonly [K in Kind]: (schedule: ScheduleOf<K>) => R }

// The generic `K` connects the row of the table to the kind of the schedule.
function apply<K extends Kind, R>(table: ByKind<R>, every: K, schedule: ScheduleOf<K>): R {
  return table[every](schedule)
}

/**
 * Call the row of a table for the kind of a schedule.
 */
export function match<R>(schedule: Schedule, table: ByKind<R>): R {
  return apply(table, schedule.every, schedule)
}
