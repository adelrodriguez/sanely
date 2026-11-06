import type { DAY_GROUPS, DayOfMonth, HOUR_INTERVALS, MINUTE_INTERVALS, WEEKDAYS } from "./words"

// Every subset of the days, in calendar order. 2^7 = 128 tuples, with the empty tuple.
type Subsets<T extends readonly string[]> = T extends readonly [
  infer Head extends string,
  ...infer Rest extends string[],
]
  ? Subsets<Rest> | [Head, ...Subsets<Rest>]
  : []

/**
 * The list format of a cron phrase: `"monday"`, `"monday and friday"`, `"monday, wednesday and
 * friday"`.
 */
export type FormatList<T extends readonly string[]> = T extends readonly [infer Only extends string]
  ? Only
  : T extends readonly [infer First extends string, infer Last extends string]
    ? `${First} and ${Last}`
    : T extends readonly [infer First extends string, ...infer Rest extends string[]]
      ? `${First}, ${FormatList<Rest>}`
      : ""

/**
 * A list of one or more day names in calendar order, such as `"monday, wednesday and friday"`.
 * There are 127 lists.
 */
export type DayNameList = FormatList<Exclude<Subsets<typeof WEEKDAYS>, []>>

type DayGroupRow = (typeof DAY_GROUPS)[number]

/**
 * The day set of a cron phrase. After `every` a day group is singular (`"weekday"`), and after `on`
 * it is plural (`"weekdays"`).
 */
export type PhraseDaySet<Context extends "every" | "on"> =
  | DayNameList
  | (Context extends "every" ? DayGroupRow["singular"] : DayGroupRow["name"])

// Each member of a union of numbers with its suffix.
type WithSuffix<N extends number> = N extends unknown
  ? `${N}` extends "11" | "12" | "13"
    ? `${N}th`
    : `${N}` extends `${string}1`
      ? `${N}st`
      : `${N}` extends `${string}2`
        ? `${N}nd`
        : `${N}` extends `${string}3`
          ? `${N}rd`
          : `${N}th`
  : never

/**
 * A day of the month in a cron phrase, from `"1st"` to `"28th"`.
 */
export type Ordinal = WithSuffix<DayOfMonth>

// The reason text for a list of choices: "2, 3, or 4".
type JoinChoices<T extends readonly number[]> = T extends readonly [infer Last extends number]
  ? `or ${Last}`
  : T extends readonly [infer First extends number, ...infer Rest extends number[]]
    ? `${First}, ${JoinChoices<Rest>}`
    : ""

export type MinuteChoices = `Use ${JoinChoices<typeof MINUTE_INTERVALS>}`
export type HourChoices = `Use ${JoinChoices<typeof HOUR_INTERVALS>}`
