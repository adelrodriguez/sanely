import type { CronPhrase } from "#lib/schedule/index.ts"
import type { HourChoices, MinuteChoices, Ordinal, PhraseDaySet } from "#lib/vocabulary/types.ts"
import type {
  HourInterval,
  MinuteInterval,
  Shortcut,
  WEEKDAYS,
  Weekday,
} from "#lib/vocabulary/words.ts"

// ---------------------------------------------------------------------------------------------
// The validator. It follows the same steps as the runtime grammar, so that the reasons agree.
// ---------------------------------------------------------------------------------------------

type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
type NonZeroDigit = Exclude<Digit, "0">

type AllDigits<S extends string> = S extends ""
  ? true
  : S extends `${Digit}${infer Rest}`
    ? AllDigits<Rest>
    : false

type IsWholeNumber<S extends string> = S extends `${NonZeroDigit}${infer Rest}`
  ? AllDigits<Rest>
  : false

// The first word, and the text after the first space ("" at the end of the phrase).
type FirstWord<S extends string> = S extends `${infer First} ${string}` ? First : S
type AfterFirstWord<S extends string> = S extends `${string} ${infer Rest}` ? Rest : ""

type Unexpected<
  Rest extends string,
  Before extends string,
> = `unexpected text "${Rest}" after "${Before}"`

// ---- Intervals ----

type IsBelow60<N extends string> = N extends Digit | `${"1" | "2" | "3" | "4" | "5"}${Digit}`
  ? true
  : false
type IsBelow24<N extends string> = N extends Digit | `1${Digit}` | `2${"0" | "1" | "2" | "3"}`
  ? true
  : false

type CheckInterval<N extends string, Unit extends string> =
  IsWholeNumber<N> extends false
    ? `"${N}" is not a valid interval. Use a whole number without a leading zero`
    : Unit extends "minutes"
      ? N extends `${MinuteInterval}`
        ? true
        : N extends "1"
          ? `use "every minute" for an interval of 1 minute`
          : N extends "60"
            ? `use "every hour" for an interval of 60 minutes`
            : IsBelow60<N> extends true
              ? `${N} does not divide 60. ${MinuteChoices}`
              : `${N} minutes has no exact single cron. ${MinuteChoices}`
      : N extends `${HourInterval}`
        ? true
        : N extends "1"
          ? `use "every hour" for an interval of 1 hour`
          : N extends "24"
            ? `use "every day at midnight" for an interval of 24 hours`
            : IsBelow24<N> extends true
              ? `${N} does not divide 24. ${HourChoices}`
              : `${N} hours has no exact single cron. ${HourChoices}`

// ---- Times ----

type Minute = `${"0" | "1" | "2" | "3" | "4" | "5"}${Digit}`
type Hour24 = Digit | `${"0" | "1"}${Digit}` | `2${"0" | "1" | "2" | "3"}`
type Hour12 = NonZeroDigit | "10" | "11" | "12"

interface ClockTime {
  hour: number
  minute: string
}

type TimeFormats = "Use H:MM or HH:MM (24-hour), H:MMam or H:MMpm, noon, or midnight"
type InvalidTime<T extends string> = `"${T}" is not a valid time. ${TimeFormats}`

type ToNumber<S extends string> = S extends `0${infer Digits extends number}`
  ? Digits
  : S extends `${infer Value extends number}`
    ? Value
    : never

type PmHours = {
  "1": 13
  "2": 14
  "3": 15
  "4": 16
  "5": 17
  "6": 18
  "7": 19
  "8": 20
  "9": 21
  "10": 22
  "11": 23
  "12": 12
}

type CheckMeridiemTime<
  T extends string,
  H extends string,
  M extends string,
  Meridiem extends string,
> = [H, M] extends [Hour12, Minute]
  ? [H, M] extends ["12", "00"]
    ? `"${T}" is ambiguous. Use ${Meridiem extends "am" ? "midnight" : "noon"}`
    : {
        hour: Meridiem extends "am"
          ? H extends "12"
            ? 0
            : ToNumber<H>
          : PmHours[H & keyof PmHours]
        minute: M
      }
  : InvalidTime<T>

type CheckTime<T extends string> = T extends "noon"
  ? { hour: 12; minute: "00" }
  : T extends "midnight"
    ? { hour: 0; minute: "00" }
    : T extends `${infer H}:${infer M}am`
      ? CheckMeridiemTime<T, H, M, "am">
      : T extends `${infer H}:${infer M}pm`
        ? CheckMeridiemTime<T, H, M, "pm">
        : T extends `${infer H}:${infer M}`
          ? [H, M] extends [Hour24, Minute]
            ? { hour: ToNumber<H>; minute: M }
            : InvalidTime<T>
          : T extends Digit | `${Digit}${Digit}`
            ? `"${T}" is not a valid time. Write the minutes, such as "${T}:00", and use 24-hour time or am/pm`
            : T extends `${infer H extends Digit | `${Digit}${Digit}`}${infer Meridiem extends "am" | "pm"}`
              ? `"${T}" is not a valid time. Write the minutes, such as "${H}:00${Meridiem}"`
              : InvalidTime<T>

// Check the time at the start of `Rest`. `Before` is the text before it.
type CheckTimeAt<Rest extends string, Before extends string> = Rest extends ""
  ? `expected a time after "${Before}"`
  : CheckTime<FirstWord<Rest>> extends infer Result
    ? Result extends string
      ? Result
      : AfterFirstWord<Rest> extends ""
        ? true
        : Unexpected<AfterFirstWord<Rest>, `${Before} ${FirstWord<Rest>}`>
    : never

type CheckAtClause<Rest extends string, Before extends string> = Rest extends ""
  ? `expected "at <time>" after "${Before}"`
  : Rest extends "at"
    ? `expected a time after "${Before} at"`
    : Rest extends `at ${infer Time}`
      ? CheckTimeAt<Time, `${Before} at`>
      : `expected "at" after "${Before}"`

// ---- Day sets ----

type DayGroupWord = "weekday" | "weekdays" | "weekend" | "weekends"
type DaySetHint = "Use monday to sunday, weekday, weekend, or weekdays, weekends"

// The day names in a list, without separators.
type ListNames<S extends string> = S extends `${infer Word} ${infer Rest}`
  ? Word extends "and"
    ? ListNames<Rest>
    : [Word extends `${infer Name},` ? Name : Word, ...ListNames<Rest>]
  : [S extends `${infer Name},` ? Name : S]

type FormatList<T extends readonly string[]> = T extends readonly [infer Only extends string]
  ? Only
  : T extends readonly [infer First extends string, infer Last extends string]
    ? `${First} and ${Last}`
    : T extends readonly [infer First extends string, ...infer Rest extends string[]]
      ? `${First}, ${FormatList<Rest>}`
      : ""

type InCalendarOrder<
  Names extends string,
  Days extends readonly string[] = typeof WEEKDAYS,
> = Days extends readonly [infer First extends string, ...infer Rest extends string[]]
  ? First extends Names
    ? [First, ...InCalendarOrder<Names, Rest>]
    : InCalendarOrder<Names, Rest>
  : []

type FindInvalidName<Names extends readonly string[]> = Names extends readonly [
  infer First extends string,
  ...infer Rest extends string[],
]
  ? First extends DayGroupWord
    ? `"${First}" cannot be part of a list of days`
    : First extends Weekday
      ? FindInvalidName<Rest>
      : `"${First}" is not a day. ${DaySetHint}`
  : true

type FindDuplicate<
  Names extends readonly string[],
  Seen extends string = never,
> = Names extends readonly [infer First extends string, ...infer Rest extends string[]]
  ? First extends Seen
    ? `"${First}" is in the list more than one time`
    : FindDuplicate<Rest, Seen | First>
  : true

type CheckDayList<S extends string, Names extends string[] = ListNames<S>> =
  FindInvalidName<Names> extends infer Invalid extends string
    ? Invalid
    : FindDuplicate<Names> extends infer Duplicate extends string
      ? Duplicate
      : InCalendarOrder<Names[number]> extends infer Sorted extends string[]
        ? Sorted extends Names
          ? `write the list as "${FormatList<Names>}"`
          : `list the days in calendar order, Monday first: "${FormatList<Sorted>}"`
        : never

type CheckDaySet<S extends string, Context extends "every" | "on"> =
  S extends PhraseDaySet<Context>
    ? true
    : S extends "weekday" | "weekdays"
      ? `use "${Context extends "every" ? "weekday" : "weekdays"}" after "${Context}"`
      : S extends "weekend" | "weekends"
        ? `use "${Context extends "every" ? "weekend" : "weekends"}" after "${Context}"`
        : CheckDayList<S>

// The day set after `on` ends at the end of the phrase, or before `at` or `between`.
type CutDaySet<S extends string> = S extends `${infer Days} at ${infer Rest}`
  ? Days extends `${infer Earlier} between ${infer Later}`
    ? [Earlier, `between ${Later} at ${Rest}`]
    : [Days, `at ${Rest}`]
  : S extends `${infer Days} between ${infer Rest}`
    ? [Days, `between ${Rest}`]
    : [S, ""]

// ---- Clauses of the interval shapes ----

type MinuteAtClause =
  `a minute interval cannot have an "at" clause. Use "between <time> and <time>" to limit it to a window`

type CheckOnClause<S extends string, Unit extends "minute" | "hour"> =
  CutDaySet<S> extends [infer Days extends string, infer Rest extends string]
    ? CheckDaySet<Days, "on"> extends infer Result extends string
      ? Result
      : Rest extends ""
        ? true
        : Rest extends `between ${string}`
          ? Unit extends "minute"
            ? `the window clause must come before the "on" clause`
            : "an hour interval cannot have a window"
          : Unit extends "minute"
            ? MinuteAtClause
            : `an hour interval cannot have an "at" clause`
    : never

type CheckWindowHours<
  Start extends ClockTime,
  End extends ClockTime,
  StartText extends string,
  EndText extends string,
> = Start["minute"] extends "00"
  ? End["minute"] extends "00"
    ? IsBefore<Start["hour"], End["hour"] extends 0 ? 24 : End["hour"]> extends true
      ? true
      : "the window must end after it starts"
    : `the window must start and end on the hour, and "${EndText}" is not on the hour`
  : `the window must start and end on the hour, and "${StartText}" is not on the hour`

type Tuple<N extends number, T extends unknown[] = []> = T["length"] extends N
  ? T
  : Tuple<N, [...T, unknown]>
type IsBefore<A extends number, B extends number> =
  Tuple<B> extends [...Tuple<A>, unknown, ...unknown[]] ? true : false

type CheckWindow<S extends string, Before extends string> = S extends ""
  ? `expected a time after "${Before} between"`
  : CheckTime<FirstWord<S>> extends infer Start
    ? Start extends string
      ? Start
      : AfterFirstWord<S> extends `and ${infer EndRest}`
        ? EndRest extends ""
          ? `expected a time after "${Before} between ${FirstWord<S>} and"`
          : CheckTime<FirstWord<EndRest>> extends infer End
            ? End extends string
              ? End
              : CheckWindowHours<
                    Start & ClockTime,
                    End & ClockTime,
                    FirstWord<S>,
                    FirstWord<EndRest>
                  > extends infer Hours extends string
                ? Hours
                : CheckAfterWindow<
                    AfterFirstWord<EndRest>,
                    `${Before} between ${FirstWord<S>} and ${FirstWord<EndRest>}`
                  >
            : never
        : `expected "and" after "${Before} between ${FirstWord<S>}"`
    : never

type CheckAfterWindow<Rest extends string, Before extends string> = Rest extends ""
  ? true
  : Rest extends `on ${infer Days}`
    ? CheckOnClause<Days, "minute">
    : Rest extends "at" | `at ${string}`
      ? MinuteAtClause
      : Unexpected<Rest, Before>

type CheckMinuteClauses<Rest extends string, Before extends string> = Rest extends ""
  ? true
  : Rest extends "between" | `between ${string}`
    ? CheckWindow<AfterFirstWord<Rest>, Before>
    : Rest extends `on ${infer Days}`
      ? CheckOnClause<Days, "minute">
      : Rest extends "at" | `at ${string}`
        ? MinuteAtClause
        : Unexpected<Rest, Before>

type CheckHourClauses<Rest extends string, Before extends string> = Rest extends ""
  ? true
  : Rest extends "between" | `between ${string}`
    ? "an hour interval cannot have a window"
    : Rest extends `on ${infer Days}`
      ? CheckOnClause<Days, "hour">
      : Rest extends "at" | `at ${string}`
        ? `an hour interval cannot have an "at" clause`
        : Unexpected<Rest, Before>

// ---- Sentence shapes ----

type CheckIntervalShape<N extends string, Rest extends string> = Rest extends ""
  ? `expected "minutes" or "hours" after "every ${N}"`
  : FirstWord<Rest> extends infer Unit extends string
    ? Unit extends "minute" | "hour"
      ? `use "${Unit}s" after a number`
      : Unit extends "minutes" | "hours"
        ? CheckInterval<N, Unit> extends infer Result extends string
          ? Result
          : Unit extends "minutes"
            ? CheckMinuteClauses<AfterFirstWord<Rest>, `every ${N} minutes`>
            : CheckHourClauses<AfterFirstWord<Rest>, `every ${N} hours`>
        : `"${Unit}" is not an interval unit. Use minutes or hours`
    : never

type CheckDaysShape<S extends string> = S extends `${infer Days} at ${infer Time}`
  ? CheckDaySet<Days, "every"> extends infer Result extends string
    ? Result
    : CheckTimeAt<Time, `every ${Days} at`>
  : CheckDaySet<S, "every"> extends infer Result extends string
    ? Result
    : `expected "at <time>" after "every ${S}"`

type CheckEvery<S extends string> = S extends ""
  ? `expected an interval, "day", or a day set after "every"`
  : FirstWord<S> extends infer First extends string
    ? First extends "minute"
      ? CheckMinuteClauses<AfterFirstWord<S>, "every minute">
      : First extends "hour"
        ? CheckHourClauses<AfterFirstWord<S>, "every hour">
        : First extends "minutes" | "hours"
          ? `use "every ${First extends "minutes" ? "minute" : "hour"}", or write a number before "${First}"`
          : First extends "day"
            ? CheckAtClause<AfterFirstWord<S>, "every day">
            : First extends `${"+" | "-" | ""}${Digit | "."}${string}`
              ? CheckIntervalShape<First, AfterFirstWord<S>>
              : CheckDaysShape<S>
    : never

type CheckOrdinal<O extends string> = O extends Ordinal
  ? true
  : O extends `${infer N}${"st" | "nd" | "rd" | "th"}`
    ? IsWholeNumber<N> extends true
      ? N extends "29" | "30" | "31"
        ? `the ${O} does not occur in every month. Use 1st to 28th`
        : N extends Digit | `${"1" | "2"}${Digit}`
          ? `"${O}" has the wrong suffix. Use "${Extract<Ordinal, `${N}${"st" | "nd" | "rd" | "th"}`>}"`
          : `"${O}" is not a day of the month. Use 1st to 28th`
      : `"${O}" is not a day of the month. Use 1st to 28th`
    : `"${O}" is not a day of the month. Use 1st to 28th`

type CheckDayOfMonth<S extends string> = S extends `the ${infer Rest}`
  ? CheckOrdinal<FirstWord<Rest>> extends infer Result extends string
    ? Result
    : AfterFirstWord<Rest> extends `of every month${infer Tail}`
      ? Tail extends "" | ` ${string}`
        ? CheckAtClause<AfterFirstWord<Tail>, `on the ${FirstWord<Rest>} of every month`>
        : `expected "of every month" after "on the ${FirstWord<Rest>}"`
      : `expected "of every month" after "on the ${FirstWord<Rest>}"`
  : `expected "the" after "on"`

type InvalidStart<First extends string> =
  `"${First}" is not a valid start of a phrase. Start with "every", "on the", or a shortcut: hourly, daily, weekly, or monthly`

type CheckShape<P extends string> = P extends Shortcut
  ? true
  : FirstWord<P> extends infer First extends string
    ? First extends Shortcut
      ? Unexpected<AfterFirstWord<P>, First>
      : First extends "every"
        ? CheckEvery<AfterFirstWord<P>>
        : First extends "on"
          ? CheckDayOfMonth<AfterFirstWord<P>>
          : InvalidStart<First>
    : never

type CheckPhrase<P extends string> = P extends ""
  ? "the phrase is empty"
  : P extends Lowercase<P>
    ? P extends ` ${string}` | `${string} ` | `${string}  ${string}`
      ? "use one space between words, and no space at the start or the end"
      : CheckShape<P>
    : "use lowercase words"

type NotLiteral = "a string is not a CronPhrase. Use parse for a string at runtime"

/**
 * Check a type against the strict form. The result is `T` when `T` is a valid cron phrase, and a
 * reason that names the failed part when it is not.
 *
 * A string literal is checked word by word. A type that is not a literal is valid only if it is a
 * `CronPhrase` (for example, the result of `describe`). A plain `string` is not valid.
 *
 * Use this type to write functions that take a typed cron phrase:
 *
 * @example
 *   function schedule<T extends string>(phrase: ValidateCronPhrase<T>) {}
 *
 *   schedule("every 15 minutes") // OK
 *   schedule("every 7 minutes") // Error: "7 does not divide 60. Use 2, 3, 4, 5, 6, 10, 12, 15, 20, or 30"
 */
export type ValidateCronPhrase<T extends string> = [T] extends [CronPhrase]
  ? [CronPhrase] extends [T]
    ? T
    : CheckEachMember<T>
  : CheckEachMember<T>

// Check each member of a union. A member that is not a literal (`string`, or a template literal
// type) gives an index signature in `Record<T, 1>`, so `{}` extends it. A literal gives a required
// property, so `{}` does not extend it. No other object type gives this test: an index signature
// in the source type also matches a required property.
type CheckEachMember<T extends string> = T extends unknown
  ? // oxlint-disable-next-line typescript/no-empty-object-type
    {} extends Record<T, 1>
    ? T extends CronPhrase
      ? T
      : NotLiteral
    : CheckPhrase<T> extends infer Result
      ? Result extends true
        ? T
        : Result
      : never
  : never
