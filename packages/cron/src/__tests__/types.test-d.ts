// Compile-time checks only: `pnpm run check` enforces this file, and Vitest never runs it.
// It tests the public types through the package entry, the same as a package consumer uses them.
import { expectTypeOf } from "vitest"
import type { GRAMMAR } from "#lib/grammar/__tests__/grammar.table.ts"
import {
  cron,
  type CronPhrase,
  type DayNameList,
  type DaySet,
  type HourInterval,
  InvalidCronPhraseError,
  isCronPhrase,
  isValidCronPhrase,
  type MinuteInterval,
  type OnDaySet,
  type Ordinal,
  parse,
  safeParse,
  type Shortcut,
  type ValidateCronPhrase,
  type Weekday,
} from "#index.ts"

// ── Test fixtures ────────────────────────────────────────────────────────────
declare const userInput: string

type NotLiteral =
  "a string is not a CronPhrase. Use parse, or narrow the string with isCronPhrase first"

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
// `never`. The runtime tests read the same table (see grammar.table.ts).

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

// Documents a known limitation: CronPhrase does not check times and interval clauses. `cron` and
// `ValidateCronPhrase` check them.
{
  expectTypeOf<"every day at 25:00">().toExtend<CronPhrase>()
  expectTypeOf<"every 15 minutes on frday">().toExtend<CronPhrase>()
  expectTypeOf<"every 15 minutes between 17:00 and 9:00">().toExtend<CronPhrase>()
}

// Slot types

// Makes Weekday the seven day names.
{
  expectTypeOf<Weekday>().toEqualTypeOf<
    "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday"
  >()
}

// Makes the interval types the divisors of 60 and 24, without 1.
{
  expectTypeOf<MinuteInterval>().toEqualTypeOf<2 | 3 | 4 | 5 | 6 | 10 | 12 | 15 | 20 | 30>()
  expectTypeOf<HourInterval>().toEqualTypeOf<2 | 3 | 4 | 6 | 8 | 12>()
}

// Makes Shortcut the four shortcut words.
{
  expectTypeOf<Shortcut>().toEqualTypeOf<"hourly" | "daily" | "weekly" | "monthly">()
}

// Gives each Ordinal the correct suffix.
{
  expectTypeOf<
    "1st" | "2nd" | "3rd" | "4th" | "11th" | "12th" | "13th" | "21st" | "22nd" | "23rd" | "28th"
  >().toExtend<Ordinal>()
}

// Lists the day names in calendar order, with the list format "a, b and c".
{
  expectTypeOf<
    "monday" | "monday and friday" | "monday, wednesday and friday"
  >().toExtend<DayNameList>()
  expectTypeOf<"monday, tuesday, wednesday, thursday, friday, saturday and sunday">().toExtend<DayNameList>()
}

// Adds the singular day groups to DaySet, and the plural day groups to OnDaySet.
{
  expectTypeOf<DaySet>().toEqualTypeOf<DayNameList | "weekday" | "weekend">()
  expectTypeOf<OnDaySet>().toEqualTypeOf<DayNameList | "weekdays" | "weekends">()
}

// cron

// Accepts a strict string literal in cron, and returns string.
{
  expectTypeOf(cron("every 15 minutes")).toEqualTypeOf<string>()
  expectTypeOf(cron("every 15 minutes between 9:00 and 17:00 on weekdays")).toEqualTypeOf<string>()
  expectTypeOf(cron("every monday and friday at 12:00")).toEqualTypeOf<string>()
  expectTypeOf(cron("on the 1st of every month at 8:00")).toEqualTypeOf<string>()
  expectTypeOf(cron("every day at 9:30pm")).toEqualTypeOf<string>()
  expectTypeOf(cron("hourly")).toEqualTypeOf<string>()
}

// Accepts a CronPhrase value in cron.
{
  const phrase: CronPhrase = "every weekday at 17:30"
  const phrases: CronPhrase[] = ["daily", "every 2 hours on weekends"]

  cron(phrase)
  phrases.map((value) => cron(value))
}

// Accepts a template literal type that is a CronPhrase in cron.
{
  const day = "monday" as Weekday
  const time = "9:30" as `${number}:${number}`

  expectTypeOf(cron(`every ${day} at ${time}`)).toEqualTypeOf<string>()
}

// Accepts a string that isCronPhrase narrowed in cron.
{
  if (isCronPhrase(userInput)) cron(userInput)
}

// parse and safeParse

// Accepts any string in parse and safeParse.
{
  expectTypeOf(parse(userInput)).toEqualTypeOf<string>()
  expectTypeOf(safeParse(userInput)).toEqualTypeOf<string | null>()
  expectTypeOf(parse).parameters.toEqualTypeOf<[value: string]>()
  expectTypeOf(safeParse).parameters.toEqualTypeOf<[value: string]>()
}

// Accepts the lenient form in a string literal.
{
  expectTypeOf(parse("Every 15 Mins")).toEqualTypeOf<string>()
  expectTypeOf(safeParse("every 7 minutes")).toEqualTypeOf<string | null>()
}

// Guards

// Narrows a string to CronPhrase with isCronPhrase.
{
  if (isCronPhrase(userInput)) {
    // A deep type comparison of the large CronPhrase union is slow, so check one direction.
    expectTypeOf(userInput).toExtend<CronPhrase>()
  } else {
    expectTypeOf(userInput).toEqualTypeOf<string>()
  }
}

// Returns a plain boolean from isValidCronPhrase, without narrowing.
{
  expectTypeOf(isValidCronPhrase).returns.toEqualTypeOf<boolean>()

  if (isValidCronPhrase(userInput)) {
    expectTypeOf(userInput).toEqualTypeOf<string>()
  }
}

// Takes a string in both guards.
{
  expectTypeOf(isCronPhrase).parameters.toEqualTypeOf<[value: string]>()
  expectTypeOf(isValidCronPhrase).parameters.toEqualTypeOf<[value: string]>()
}

// InvalidCronPhraseError

// Exposes the invalid input on InvalidCronPhraseError as readonly unknown.
{
  const error = new InvalidCronPhraseError("every 7 minutes", "7 does not divide 60")

  expectTypeOf(error).toExtend<Error>()
  expectTypeOf(error.value).toBeUnknown()
  expectTypeOf(InvalidCronPhraseError).constructorParameters.toEqualTypeOf<
    [value: unknown, reason: string]
  >()
}

// ── Negative type tests ──────────────────────────────────────────────────────
// These verify that invalid usage produces compile-time errors.
// The function bodies never execute — only the type checker matters.

function _negativeTypeTests() {
  // @ts-expect-error -- 7 is not a minute interval
  const interval: CronPhrase = "every 7 minutes"
  void interval

  // @ts-expect-error -- the 29th is not an Ordinal
  const ordinal: CronPhrase = "on the 29th of every month at 9:00"
  void ordinal

  // @ts-expect-error -- the days after "every" are not in calendar order
  const days: CronPhrase = "every friday and monday at 9:00"
  void days

  // @ts-expect-error -- a minute interval cannot have an "at" clause
  const at: CronPhrase = "every 15 minutes at 9:30"
  void at

  // @ts-expect-error -- "biweekly" is not in the language
  const word: CronPhrase = "biweekly"
  void word

  // @ts-expect-error -- "weekday" is a day group, not a Weekday
  const weekday: Weekday = "weekday"
  void weekday

  // @ts-expect-error -- 1 is spelled "every minute"
  const minutes: MinuteInterval = 1
  void minutes

  // @ts-expect-error -- 5 does not divide 24
  const hours: HourInterval = 5
  void hours

  // @ts-expect-error -- the 29th does not occur in every month
  const day: Ordinal = "29th"
  void day

  // @ts-expect-error -- the suffix of 1 is "st"
  const suffix: Ordinal = "1th"
  void suffix

  // @ts-expect-error -- the days are not in calendar order
  const order: DayNameList = "friday and monday"
  void order

  // @ts-expect-error -- the last separator is "and"
  const separator: DayNameList = "monday, friday"
  void separator

  // @ts-expect-error -- a day group stands alone
  const group: DaySet = "weekday and saturday"
  void group

  // @ts-expect-error -- the day group after "every" is singular
  const plural: DaySet = "weekdays"
  void plural

  // @ts-expect-error -- the day group after "on" is plural
  const singular: OnDaySet = "weekday"
  void singular

  // @ts-expect-error -- "biweekly" is not a Shortcut
  const shortcut: Shortcut = "biweekly"
  void shortcut

  // @ts-expect-error -- 7 does not divide 60
  cron("every 7 minutes")

  // @ts-expect-error -- 90 minutes has no exact single cron
  cron("every 90 minutes")

  // @ts-expect-error -- 5 does not divide 24
  cron("every 5 hours")

  // @ts-expect-error -- a plain string must be narrowed with isCronPhrase first, or use parse
  cron(userInput)

  // @ts-expect-error -- a template literal type that is not a CronPhrase
  cron(`every ${userInput}`)

  // @ts-expect-error -- a union with one invalid member
  cron(Math.random() > 0.5 ? "every 15 minutes" : "every 7 minutes")

  // @ts-expect-error -- a time must have minutes
  cron("every day at 9")

  // @ts-expect-error -- 12:00pm is ambiguous; use noon
  cron("every day at 12:00pm")

  // @ts-expect-error -- 25:00 is not a valid time
  cron("every day at 25:00")

  // @ts-expect-error -- the days are not in calendar order
  cron("every friday and monday at 9:00")

  // @ts-expect-error -- the list format is "monday, wednesday and friday"
  cron("every monday, wednesday, and friday at 9:00")

  // @ts-expect-error -- the day set after "on" is "weekdays"
  cron("every 15 minutes on weekday")

  // @ts-expect-error -- the window must be on the hour
  cron("every 15 minutes between 9:30 and 17:00")

  // @ts-expect-error -- the window must end after it starts
  cron("every 15 minutes between 17:00 and 9:00")

  // @ts-expect-error -- a minute interval cannot have an "at" clause
  cron("every 15 minutes at 9:30")

  // @ts-expect-error -- the 29th does not occur in every month
  cron("on the 29th of every month at 9:00")

  // @ts-expect-error -- the lenient form is not a CronPhrase; use parse
  cron("Every 15 Mins")

  // @ts-expect-error -- extra whitespace is not a CronPhrase
  cron("every  15 minutes")

  // @ts-expect-error -- "biweekly" is not in the language
  cron("biweekly")

  // @ts-expect-error -- an empty string is not a CronPhrase
  cron("")

  // @ts-expect-error -- cron takes a string, not a number
  cron(15)

  // @ts-expect-error -- parse takes a string
  parse(15)

  // @ts-expect-error -- safeParse takes a string
  safeParse(null)

  // @ts-expect-error -- isCronPhrase takes a string
  isCronPhrase(15)

  // @ts-expect-error -- isValidCronPhrase takes a string
  isValidCronPhrase(null)

  const error = new InvalidCronPhraseError("every 7 minutes", "7 does not divide 60")

  // @ts-expect-error -- value is readonly
  error.value = "every 15 minutes"

  // @ts-expect-error -- the reason is required
  void new InvalidCronPhraseError("every 7 minutes")
}

// Suppress unused function warning — this exists only for type checking
void _negativeTypeTests
