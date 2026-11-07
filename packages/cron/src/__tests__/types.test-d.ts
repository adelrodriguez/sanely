// Compile-time checks only: `pnpm run check` enforces this file, and Vitest never runs it.
// It tests the public types through the package entry, the same as a package consumer uses them.
import { expectTypeOf } from "vitest"
import type { GRAMMAR } from "#lib/grammar/__tests__/index.table.ts"
import {
  cron,
  type CronExpression,
  type CronPhrase,
  type DayOfMonth,
  type DaySet,
  describe,
  HOUR_INTERVALS,
  type HourInterval,
  InvalidScheduleError,
  isSchedule,
  MINUTE_INTERVALS,
  type MinuteInterval,
  parse,
  safeParse,
  type Schedule,
  type Time,
  type ValidateCronPhrase,
  WEEKDAYS,
  type Weekday,
  type Window,
} from "#index.ts"

// ── Test fixtures ────────────────────────────────────────────────────────────
declare const userInput: string
declare const anySchedule: Schedule

type NotLiteral = "a string is not a CronPhrase. Use parse for a string at runtime"

type Row = (typeof GRAMMAR)[number]
type StrictPhrase = Extract<Row, { strict: true }>["phrase"]
type NonStrictRow = Extract<Row, { strict: false }>

type IsAccepted<P extends string> = ValidateCronPhrase<P> extends P ? true : false

type ExpectedReason<R> = R extends { strictError: infer Reason extends string }
  ? Reason
  : R extends { error: infer Reason extends string }
    ? Reason
    : never

// ── Grammar table ────────────────────────────────────────────────────────────
// Each type below names the rows where the types and the grammar table disagree. It must be
// `never`. The runtime tests read the same table (see lib/grammar/__tests__/index.table.ts).

// Accepts each strict row with ValidateCronPhrase and with CronPhrase.
{
  type Rejected = { [P in StrictPhrase]: IsAccepted<P> extends true ? never : P }[StrictPhrase]

  expectTypeOf<Rejected>().toBeNever()
  expectTypeOf<Exclude<StrictPhrase, CronPhrase>>().toBeNever()
}

// Rejects each row that is not in the strict form.
{
  type Accepted = NonStrictRow extends infer R
    ? R extends { phrase: infer P extends string }
      ? IsAccepted<P> extends true
        ? P
        : never
      : never
    : never

  expectTypeOf<Accepted>().toBeNever()
}

// Gives the reason of the grammar table for each rejected row.
{
  type OtherReason = NonStrictRow extends infer R
    ? R extends { phrase: infer P extends string }
      ? [ExpectedReason<R>] extends [never]
        ? never
        : ValidateCronPhrase<P> extends `${string}${ExpectedReason<R>}${string}`
          ? never
          : { expected: ExpectedReason<R>; phrase: P; received: ValidateCronPhrase<P> }
      : never
    : never

  expectTypeOf<OtherReason>().toBeNever()
}

// ── Positive type-level tests ────────────────────────────────────────────────
// ValidateCronPhrase and CronPhrase

// Names the failed part of an invalid literal in ValidateCronPhrase.
{
  expectTypeOf<
    ValidateCronPhrase<"every 7 minutes">
  >().toEqualTypeOf<"7 does not divide 60. Use 2, 3, 4, 5, 6, 10, 12, 15, 20, or 30">()
  expectTypeOf<
    ValidateCronPhrase<"every 90 minutes">
  >().toEqualTypeOf<"90 minutes has no exact single cron. Use 2, 3, 4, 5, 6, 10, 12, 15, 20, or 30">()
  expectTypeOf<
    ValidateCronPhrase<"every day at 25:00">
  >().toEqualTypeOf<'"25:00" is not a valid time. Use H:MM or HH:MM (24-hour), H:MMam or H:MMpm, noon, or midnight'>()
  expectTypeOf<
    ValidateCronPhrase<"every sunday and monday at 9:00">
  >().toEqualTypeOf<'list the days in calendar order, Monday first: "monday and sunday"'>()
  expectTypeOf<ValidateCronPhrase<"Every 15 Minutes">>().toEqualTypeOf<"use lowercase words">()
}

// Returns a valid literal from ValidateCronPhrase without a change.
{
  expectTypeOf<ValidateCronPhrase<"every 15 minutes">>().toEqualTypeOf<"every 15 minutes">()
  expectTypeOf<ValidateCronPhrase<"hourly">>().toEqualTypeOf<"hourly">()
}

// Accepts CronPhrase and template literal types that are a CronPhrase in ValidateCronPhrase.
{
  expectTypeOf<ValidateCronPhrase<CronPhrase>>().toEqualTypeOf<CronPhrase>()
  expectTypeOf<
    ValidateCronPhrase<`every monday at ${number}:${number}`>
  >().toEqualTypeOf<`every monday at ${number}:${number}`>()
}

// Gives a reason for a plain string in ValidateCronPhrase.
{
  expectTypeOf<ValidateCronPhrase<string>>().toEqualTypeOf<NotLiteral>()
  expectTypeOf<ValidateCronPhrase<`every ${string}`>>().toEqualTypeOf<NotLiteral>()
}

// Checks each member of a union in ValidateCronPhrase.
{
  expectTypeOf<ValidateCronPhrase<"hourly" | "every 7 minutes">>().toEqualTypeOf<
    "hourly" | "7 does not divide 60. Use 2, 3, 4, 5, 6, 10, 12, 15, 20, or 30"
  >()
}

// Accepts the sentence shapes in CronPhrase.
{
  const phrases: CronPhrase[] = [
    "hourly",
    "every minute",
    "every 15 minutes",
    "every 15 minutes on weekdays",
    "every 15 minutes between 9:00 and 17:00",
    "every hour",
    "every 2 hours on saturday and sunday",
    "every day at 9:30",
    "every weekday at 17:30",
    "every monday, wednesday and friday at 8:00",
    "on the 28th of every month at noon",
  ]

  void phrases
}

// Reduces an array of CronPhrase values without a "too complex" error. The open slots keep the
// union small enough.
{
  const phrases: CronPhrase[] = ["hourly", "daily"]
  const [first = "hourly", second = "daily"] = phrases
  const pair = [first, second]

  expectTypeOf(pair).toExtend<CronPhrase[]>()
}

// Documents a known limitation: CronPhrase does not check the slots after the sentence shape, such
// as times, day sets, ordinals, and windows. `cron` and `ValidateCronPhrase` check them.
{
  expectTypeOf<"every day at 25:00">().toExtend<CronPhrase>()
  expectTypeOf<"every monday and frday at 9:00">().toExtend<CronPhrase>()
  expectTypeOf<"on the 29th of every month at 9:00">().toExtend<CronPhrase>()
  expectTypeOf<"every 15 minutes on frday">().toExtend<CronPhrase>()
  expectTypeOf<"every 15 minutes between 17:00 and 9:00">().toExtend<CronPhrase>()
}

// ── Schedule ─────────────────────────────────────────────────────────────────

// Accepts each kind of schedule, with and without its optional keys.
{
  const schedules: Schedule[] = [
    { every: "minute" },
    { every: "minute", interval: 15 },
    { between: { from: 9, to: 17 }, every: "minute", interval: 15, on: "weekdays" },
    { between: { from: 18, to: 24 }, every: "minute" },
    { between: { from: 0, to: 1 }, every: "minute" },
    { every: "hour" },
    { every: "hour", interval: 6, on: ["saturday", "sunday"] },
    { at: { hour: 9, minute: 30 }, every: "day" },
    { at: { hour: 17, minute: 30 }, every: "day", on: ["monday", "friday"] },
    { at: { hour: 0, minute: 0 }, every: "day", on: "weekends" },
    { at: { hour: 8, minute: 0 }, day: 1, every: "month" },
    { at: { hour: 23, minute: 59 }, day: 28, every: "month" },
  ]

  void schedules
}

// Accepts a day list in any order and with duplicates, because a day list is a set.
{
  expectTypeOf<["friday", "monday", "friday"]>().toExtend<DaySet>()
}

// Narrows a schedule by its kind.
{
  if (anySchedule.every === "month") expectTypeOf(anySchedule.day).toEqualTypeOf<DayOfMonth>()
  if (anySchedule.every === "day") expectTypeOf(anySchedule.at).toEqualTypeOf<Time>()
}

// Makes the window end after its start, up to 24.
{
  expectTypeOf<Extract<Window, { from: 17 }>["to"]>().toEqualTypeOf<
    18 | 19 | 20 | 21 | 22 | 23 | 24
  >()
  expectTypeOf<Extract<Window, { from: 23 }>["to"]>().toEqualTypeOf<24>()
  expectTypeOf<Window["from"]>().toEqualTypeOf<Time["hour"]>()
}

// Makes the slot types the values of the constants.
{
  expectTypeOf<Weekday>().toEqualTypeOf<(typeof WEEKDAYS)[number]>()
  expectTypeOf<MinuteInterval>().toEqualTypeOf<(typeof MINUTE_INTERVALS)[number]>()
  expectTypeOf<HourInterval>().toEqualTypeOf<(typeof HOUR_INTERVALS)[number]>()
  expectTypeOf(WEEKDAYS).toEqualTypeOf<
    readonly ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
  >()
  expectTypeOf(MINUTE_INTERVALS).toEqualTypeOf<readonly [2, 3, 4, 5, 6, 10, 12, 15, 20, 30]>()
  expectTypeOf(HOUR_INTERVALS).toEqualTypeOf<readonly [2, 3, 4, 6, 8, 12]>()
}

// Covers the hours, the minutes, and the days of the month exactly.
{
  expectTypeOf<0 | 23>().toExtend<Time["hour"]>()
  expectTypeOf<-1>().not.toExtend<Time["hour"]>()
  expectTypeOf<24>().not.toExtend<Time["hour"]>()
  expectTypeOf<1.5>().not.toExtend<Time["hour"]>()
  expectTypeOf<0 | 59>().toExtend<Time["minute"]>()
  expectTypeOf<60>().not.toExtend<Time["minute"]>()
  expectTypeOf<1 | 28>().toExtend<DayOfMonth>()
  expectTypeOf<0>().not.toExtend<DayOfMonth>()
  expectTypeOf<29>().not.toExtend<DayOfMonth>()
}

// Makes CronExpression a string, but not every string a CronExpression.
{
  expectTypeOf<CronExpression>().toExtend<string>()
  expectTypeOf<string>().not.toExtend<CronExpression>()
}

// ── Functions ────────────────────────────────────────────────────────────────

// cron

// Accepts a strict phrase literal in cron, and returns CronExpression.
{
  expectTypeOf(cron("every 15 minutes")).toEqualTypeOf<CronExpression>()
  expectTypeOf(
    cron("every 15 minutes between 9:00 and 17:00 on weekdays")
  ).toEqualTypeOf<CronExpression>()
  expectTypeOf(cron("every monday and friday at 12:00")).toEqualTypeOf<CronExpression>()
  expectTypeOf(cron("on the 1st of every month at 8:00")).toEqualTypeOf<CronExpression>()
  expectTypeOf(cron("every day at 9:30pm")).toEqualTypeOf<CronExpression>()
  expectTypeOf(cron("hourly")).toEqualTypeOf<CronExpression>()
}

// Accepts a Schedule object literal in cron, and returns CronExpression.
{
  expectTypeOf(
    cron({ at: { hour: 17, minute: 30 }, every: "day", on: ["monday", "friday"] })
  ).toEqualTypeOf<CronExpression>()
  expectTypeOf(cron({ every: "minute", interval: 15 })).toEqualTypeOf<CronExpression>()
  expectTypeOf(
    cron({ between: { from: 9, to: 17 }, every: "minute", interval: 15, on: "weekdays" })
  ).toEqualTypeOf<CronExpression>()
  expectTypeOf(
    cron({ at: { hour: 8, minute: 0 }, day: 1, every: "month" })
  ).toEqualTypeOf<CronExpression>()
}

// Accepts a Schedule value and a CronPhrase value in cron.
{
  const phrase: CronPhrase = "every weekday at 17:30"
  const phrases: CronPhrase[] = ["daily", "every 2 hours on weekends"]
  const schedules: Schedule[] = [{ every: "hour" }, { at: { hour: 9, minute: 0 }, every: "day" }]

  expectTypeOf(cron(anySchedule)).toEqualTypeOf<CronExpression>()
  expectTypeOf(cron(phrase)).toEqualTypeOf<CronExpression>()
  phrases.map((value) => cron(value))
  schedules.map((value) => cron(value))
}

// Accepts a template literal type that is a CronPhrase in cron.
{
  const day = "monday" as Weekday
  const time = "9:30" as `${number}:${number}`

  expectTypeOf(cron(`every ${day} at ${time}`)).toEqualTypeOf<CronExpression>()
}

// Gives a CronExpression where a scheduler takes a string.
{
  const pattern: string = cron("every 15 minutes")

  void pattern
}

// parse, safeParse, and isSchedule

// Takes any value in parse and safeParse, and returns a Schedule.
{
  expectTypeOf(parse(userInput)).toEqualTypeOf<Schedule>()
  expectTypeOf(safeParse(userInput)).toEqualTypeOf<Schedule | null>()
  expectTypeOf(parse).parameters.toEqualTypeOf<[value: unknown]>()
  expectTypeOf(safeParse).parameters.toEqualTypeOf<[value: unknown]>()
  expectTypeOf(parse(JSON.parse("{}"))).toEqualTypeOf<Schedule>()
}

// Gives a Schedule from parse that cron accepts.
{
  expectTypeOf(cron(parse(userInput))).toEqualTypeOf<CronExpression>()
}

// Returns a CronPhrase from describe that cron accepts.
{
  expectTypeOf(describe(anySchedule)).toEqualTypeOf<CronPhrase>()
  expectTypeOf(cron(describe(anySchedule))).toEqualTypeOf<CronExpression>()
  expectTypeOf(describe).parameters.toEqualTypeOf<[schedule: Schedule]>()
}

// Narrows any value to Schedule with isSchedule.
{
  const value: unknown = JSON.parse("{}")

  if (isSchedule(value)) expectTypeOf(value).toEqualTypeOf<Schedule>()
  expectTypeOf(isSchedule).parameters.toEqualTypeOf<[value: unknown]>()
}

// InvalidScheduleError

// Exposes the input, the reason, and the path on InvalidScheduleError, with a literal name.
{
  const error = new InvalidScheduleError("every 7 minutes", "7 does not divide 60")

  expectTypeOf(error).toExtend<Error>()
  expectTypeOf(error.name).toEqualTypeOf<"InvalidScheduleError">()
  expectTypeOf(error.value).toBeUnknown()
  expectTypeOf(error.reason).toEqualTypeOf<string>()
  expectTypeOf(error.path).toEqualTypeOf<ReadonlyArray<string | number>>()
  expectTypeOf(InvalidScheduleError).constructorParameters.toEqualTypeOf<
    [value: unknown, reason: string, path?: ReadonlyArray<string | number>]
  >()
}

// ── Negative type tests ──────────────────────────────────────────────────────
// These verify that invalid usage produces compile-time errors. The comment above each
// `@ts-expect-error` is the message that TypeScript gives without the directive. The function
// bodies never execute: only the type checker matters.

function _negativeTypeTests() {
  // TS2322: Type '1' is not assignable to type '2 | 3 | 4 | 5 | 6 | 10 | 12 | 15 | 20 | 30'.
  // @ts-expect-error -- 1 is not a MinuteInterval: a schedule without an interval runs every minute
  const minutes: MinuteInterval = 1
  void minutes

  // TS2322: Type '5' is not assignable to type '2 | 3 | 4 | 6 | 8 | 12'.
  // @ts-expect-error -- 5 does not divide 24
  const hours: HourInterval = 5
  void hours

  // TS2322: Type '"weekday"' is not assignable to type '"friday" | "monday" | "saturday" | "sunday" | "thursday" | "tuesday" | "wednesday"'.
  // @ts-expect-error -- "weekday" is a day group, not a Weekday
  const weekday: Weekday = "weekday"
  void weekday

  // TS2820: Type '"weekday"' is not assignable to type 'DaySet'. Did you mean '"weekdays"'?
  // @ts-expect-error -- a schedule uses the plural day group
  const singular: DaySet = "weekday"
  void singular

  // TS2322: Type '[]' is not assignable to type 'DaySet'.
  // @ts-expect-error -- a day list has one or more days
  const empty: DaySet = []
  void empty

  // TS2322: Type '29' is not assignable to type 'DayOfMonth'.
  // @ts-expect-error -- the 29th does not occur in every month
  const day: DayOfMonth = 29
  void day

  // TS2322: Type '24' is not assignable to type '0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23'.
  // @ts-expect-error -- 24 is not an hour
  const hour: Time = { hour: 24, minute: 0 }
  void hour

  // TS2322: Type '60' is not assignable to type '0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30 | 31 | 32 | 33 | 34 | 35 | 36 | 37 | 38 | 39 | 40 | 41 | 42 | ... 16 more ... | 59'.
  // @ts-expect-error -- 60 is not a minute
  const minute: Time = { hour: 9, minute: 60 }
  void minute

  // TS2322: Type '{ from: 17; to: 9; }' is not assignable to type 'Window'.
  // @ts-expect-error -- the window must end after it starts
  const backwards: Window = { from: 17, to: 9 }
  void backwards

  // TS2322: Type '{ from: 9; to: 9; }' is not assignable to type 'Window'.
  // @ts-expect-error -- the window must end after it starts
  const same: Window = { from: 9, to: 9 }
  void same

  // TS2322: Type '7' is not assignable to type '2 | 3 | 4 | 5 | 6 | 10 | 12 | 15 | 20 | 30 | undefined'.
  // @ts-expect-error -- 7 does not divide 60
  const interval: Schedule = { every: "minute", interval: 7 }
  void interval

  // TS2353: Object literal may only specify known properties, and 'between' does not exist in type '{ readonly every: "hour"; readonly interval?: 2 | 3 | 4 | 6 | 8 | 12 | undefined; readonly on?: DaySet | undefined; }'.
  // @ts-expect-error -- an hour schedule has no window
  const window: Schedule = { between: { from: 9, to: 17 }, every: "hour" }
  void window

  // TS2353: Object literal may only specify known properties, and 'on' does not exist in type '{ readonly every: "month"; readonly day: DayOfMonth; readonly at: Time; }'.
  // @ts-expect-error -- a month schedule has no day set
  const monthDays: Schedule = { at: { hour: 9, minute: 0 }, day: 1, every: "month", on: "weekdays" }
  void monthDays

  // TS2322: Type '{ every: "day"; }' is not assignable to type 'Schedule'.
  // @ts-expect-error -- a day schedule needs a time
  const noTime: Schedule = { every: "day" }
  void noTime

  // TS2322: Type '"week"' is not assignable to type '"day" | "hour" | "minute" | "month"'.
  // @ts-expect-error -- "week" is not a kind of schedule
  const week: Schedule = { every: "week" }
  void week

  // TS2322: Type 'string' is not assignable to type 'CronExpression'.
  // @ts-expect-error -- a string is not a CronExpression
  const expression: CronExpression = "*/15 * * * *"
  void expression

  // TS2820: Type '"every 7 minutes"' is not assignable to type 'CronPhrase'. Did you mean '"every 2 minutes"'?
  // @ts-expect-error -- 7 is not a minute interval
  const phraseInterval: CronPhrase = "every 7 minutes"
  void phraseInterval

  // TS2820: Type '"every 15 minutes at 9:30"' is not assignable to type 'CronPhrase'. Did you mean '"every 15 minutes"'?
  // @ts-expect-error -- a minute interval cannot have an "at" clause
  const at: CronPhrase = "every 15 minutes at 9:30"
  void at

  // TS2820: Type '"biweekly"' is not assignable to type 'CronPhrase'. Did you mean '"weekly"'?
  // @ts-expect-error -- "biweekly" is not in the language
  const word: CronPhrase = "biweekly"
  void word

  // TS2322: Type '"every frday at 9:00"' is not assignable to type 'CronPhrase'.
  // @ts-expect-error -- a day set starts with a day name or a day group
  const frday: CronPhrase = "every frday at 9:00"
  void frday

  // TS2322: Type '"on the first of every month at 9:00"' is not assignable to type 'CronPhrase'.
  // @ts-expect-error -- a day of the month starts with a number
  const ordinal: CronPhrase = "on the first of every month at 9:00"
  void ordinal

  // TS2345: Argument of type '"every 7 minutes"' is not assignable to parameter of type '"7 does not divide 60. Use 2, 3, 4, 5, 6, 10, 12, 15, 20, or 30"'.
  // @ts-expect-error -- 7 does not divide 60
  cron("every 7 minutes")

  // TS2345: Argument of type '"every 90 minutes"' is not assignable to parameter of type '"90 minutes has no exact single cron. Use 2, 3, 4, 5, 6, 10, 12, 15, 20, or 30"'.
  // @ts-expect-error -- 90 minutes has no exact single cron
  cron("every 90 minutes")

  // TS2345: Argument of type '"every 5 hours"' is not assignable to parameter of type '"5 does not divide 24. Use 2, 3, 4, 6, 8, or 12"'.
  // @ts-expect-error -- 5 does not divide 24
  cron("every 5 hours")

  // TS2345: Argument of type 'string' is not assignable to parameter of type '"a string is not a CronPhrase. Use parse for a string at runtime"'.
  // @ts-expect-error -- a plain string is not a CronPhrase: use parse
  cron(userInput)

  // TS2345: Argument of type '`every ${string}`' is not assignable to parameter of type '"a string is not a CronPhrase. Use parse for a string at runtime"'.
  // @ts-expect-error -- a template literal type that is not a CronPhrase
  cron(`every ${userInput}`)

  // TS2345: Argument of type '"every 15 minutes" | "every 7 minutes"' is not assignable to parameter of type '"7 does not divide 60. Use 2, 3, 4, 5, 6, 10, 12, 15, 20, or 30" | "every 15 minutes"'.
  // @ts-expect-error -- a union with one invalid member
  cron(Math.random() > 0.5 ? "every 15 minutes" : "every 7 minutes")

  // TS2345: Argument of type '"every day at 9"' is not assignable to parameter of type '"\"9\" is not a valid time. Write the minutes, such as \"9:00\", and use 24-hour time or am/pm"'.
  // @ts-expect-error -- a time must have minutes
  cron("every day at 9")

  // TS2345: Argument of type '"every day at 12:00pm"' is not assignable to parameter of type '"\"12:00pm\" is ambiguous. Use noon"'.
  // @ts-expect-error -- 12:00pm is ambiguous; use noon
  cron("every day at 12:00pm")

  // TS2345: Argument of type '"every day at 25:00"' is not assignable to parameter of type '"\"25:00\" is not a valid time. Use H:MM or HH:MM (24-hour), H:MMam or H:MMpm, noon, or midnight"'.
  // @ts-expect-error -- 25:00 is not a valid time
  cron("every day at 25:00")

  // TS2345: Argument of type '"every friday and monday at 9:00"' is not assignable to parameter of type '"list the days in calendar order, Monday first: \"monday and friday\""'.
  // @ts-expect-error -- the days are not in calendar order
  cron("every friday and monday at 9:00")

  // TS2345: Argument of type '"every monday, wednesday, and friday at 9:00"' is not assignable to parameter of type '"write the list as \"monday, wednesday and friday\""'.
  // @ts-expect-error -- the list format is "monday, wednesday and friday"
  cron("every monday, wednesday, and friday at 9:00")

  // TS2345: Argument of type '"every 15 minutes on weekday"' is not assignable to parameter of type '"use \"weekdays\" after \"on\""'.
  // @ts-expect-error -- the day set after "on" is "weekdays"
  cron("every 15 minutes on weekday")

  // TS2345: Argument of type '"every 15 minutes between 9:30 and 17:00"' is not assignable to parameter of type '"the window must start and end on the hour, and \"9:30\" is not on the hour"'.
  // @ts-expect-error -- the window must be on the hour
  cron("every 15 minutes between 9:30 and 17:00")

  // TS2345: Argument of type '"every 15 minutes between 17:00 and 9:00"' is not assignable to parameter of type '"the window must end after it starts"'.
  // @ts-expect-error -- the window must end after it starts
  cron("every 15 minutes between 17:00 and 9:00")

  // TS2345: Argument of type '"every 15 minutes at 9:30"' is not assignable to parameter of type '"a minute interval cannot have an \"at\" clause. Use \"between <time> and <time>\" to limit it to a window"'.
  // @ts-expect-error -- a minute interval cannot have an "at" clause
  cron("every 15 minutes at 9:30")

  // TS2345: Argument of type '"on the 29th of every month at 9:00"' is not assignable to parameter of type '"the 29th does not occur in every month. Use 1st to 28th"'.
  // @ts-expect-error -- the 29th does not occur in every month
  cron("on the 29th of every month at 9:00")

  // TS2345: Argument of type '"Every 15 Mins"' is not assignable to parameter of type '"use lowercase words"'.
  // @ts-expect-error -- the lenient form is not a CronPhrase; use parse
  cron("Every 15 Mins")

  // TS2345: Argument of type '"every  15 minutes"' is not assignable to parameter of type '"use one space between words, and no space at the start or the end"'.
  // @ts-expect-error -- extra whitespace is not a CronPhrase
  cron("every  15 minutes")

  // TS2345: Argument of type '"biweekly"' is not assignable to parameter of type '"\"biweekly\" is not a valid start of a phrase. Start with \"every\", \"on the\", or a shortcut: hourly, daily, weekly, or monthly"'.
  // @ts-expect-error -- "biweekly" is not in the language
  cron("biweekly")

  // TS2345: Argument of type '""' is not assignable to parameter of type '"the phrase is empty"'.
  // @ts-expect-error -- an empty string is not a CronPhrase
  cron("")

  // TS2345: Argument of type '15' is not assignable to parameter of type '"a string is not a CronPhrase. Use parse for a string at runtime" | Schedule'.
  // @ts-expect-error -- cron takes a string or a Schedule, not a number
  cron(15)

  // TS2345: Argument of type 'string' is not assignable to parameter of type 'Schedule'.
  // @ts-expect-error -- describe takes a Schedule, not a phrase
  describe("every hour")

  // TS2322: Type '7' is not assignable to type '2 | 3 | 4 | 5 | 6 | 10 | 12 | 15 | 20 | 30 | undefined'.
  // @ts-expect-error -- 7 does not divide 60
  cron({ every: "minute", interval: 7 })

  // TS2322: Type '9' is not assignable to type '18 | 19 | 20 | 21 | 22 | 23 | 24'.
  // @ts-expect-error -- the window must end after it starts
  cron({ between: { from: 17, to: 9 }, every: "minute" })

  // TS2353: Object literal may only specify known properties, and 'on' does not exist in type '{ readonly every: "month"; readonly day: DayOfMonth; readonly at: Time; }'.
  // @ts-expect-error -- a month schedule has no day set
  cron({ at: { hour: 9, minute: 0 }, day: 1, every: "month", on: "weekdays" })

  // TS2353: Object literal may only specify known properties, and 'label' does not exist in type '{ readonly every: "hour"; readonly interval?: 2 | 3 | 4 | 6 | 8 | 12 | undefined; readonly on?: DaySet | undefined; }'.
  // @ts-expect-error -- "label" is not a key of a Schedule
  cron({ every: "hour", label: "report" })

  // TS2322: Type '[]' is not assignable to type 'DaySet | undefined'.
  // @ts-expect-error -- a day list has one or more days
  cron({ at: { hour: 9, minute: 0 }, every: "day", on: [] })

  const error = new InvalidScheduleError("every 7 minutes", "7 does not divide 60")

  // TS2540: Cannot assign to 'value' because it is a read-only property.
  // @ts-expect-error -- value is readonly
  error.value = "every 15 minutes"

  // TS2554: Expected 2-3 arguments, but got 1.
  // @ts-expect-error -- the reason is required
  void new InvalidScheduleError("every 7 minutes")
}

// Suppress unused function warning — this exists only for type checking
void _negativeTypeTests
