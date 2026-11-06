/**
 * A day name, in the strict form. The language lists days Monday first.
 *
 * Note: in a cron phrase, the day group `weekday` means Monday to Friday. This type is the set of
 * all seven day names.
 */
export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday"

type CalendarOrder = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

// Every subset of the days, in calendar order. 2^7 = 128 tuples, with the empty tuple.
type Subsets<T extends readonly string[]> = T extends readonly [
  infer Head extends string,
  ...infer Rest extends string[],
]
  ? Subsets<Rest> | [Head, ...Subsets<Rest>]
  : []

// The list format: "monday", "monday and friday", "monday, wednesday and friday".
type FormatList<T extends readonly string[]> = T extends readonly [infer Only extends string]
  ? Only
  : T extends readonly [infer First extends string, infer Last extends string]
    ? `${First} and ${Last}`
    : T extends readonly [infer First extends string, ...infer Rest extends string[]]
      ? `${First}, ${FormatList<Rest>}`
      : never

/**
 * A list of one or more day names in calendar order, such as `"monday, wednesday and friday"`.
 * There are 127 lists.
 */
export type DayNameList = FormatList<Exclude<Subsets<CalendarOrder>, []>>

/**
 * The day set that follows `every`, such as `"weekday"` or `"monday and friday"`.
 */
export type DaySet = DayNameList | "weekday" | "weekend"

/**
 * The day set that follows `on`, such as `"weekdays"` or `"monday and friday"`.
 */
export type OnDaySet = DayNameList | "weekdays" | "weekends"

/**
 * A minute interval with an exact cron. The interval of 1 is spelled `every minute`.
 */
export type MinuteInterval = 2 | 3 | 4 | 5 | 6 | 10 | 12 | 15 | 20 | 30

/**
 * An hour interval with an exact cron. The interval of 1 is spelled `every hour`.
 */
export type HourInterval = 2 | 3 | 4 | 6 | 8 | 12

type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"

type OrdinalNumber =
  | Exclude<Digit, "0">
  | `1${Digit}`
  | `2${"0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8"}`

type WithSuffix<N extends string> = N extends "11" | "12" | "13"
  ? `${N}th`
  : N extends `${string}1`
    ? `${N}st`
    : N extends `${string}2`
      ? `${N}nd`
      : N extends `${string}3`
        ? `${N}rd`
        : `${N}th`

/**
 * A day of the month, from `"1st"` to `"28th"`.
 */
export type Ordinal = WithSuffix<OrdinalNumber>

/**
 * A shortcut phrase.
 */
export type Shortcut = "hourly" | "daily" | "weekly" | "monthly"
