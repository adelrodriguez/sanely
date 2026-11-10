// Compile-time checks only: `pnpm run check` enforces this file, and Vitest never runs it.
import { expectTypeOf } from "vitest"
import {
  convert,
  days,
  type Days,
  type Duration,
  format,
  type FormatOptions,
  hours,
  type Hours,
  InvalidTimeExpressionError,
  isTimeExpression,
  isValidTimeExpression,
  type Milliseconds,
  minutes,
  type Minutes,
  months,
  type Months,
  ms,
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  MS_PER_MONTH,
  MS_PER_SECOND,
  MS_PER_WEEK,
  MS_PER_YEAR,
  parse,
  safeParse,
  type Seconds,
  seconds,
  type TimeExpression,
  type Unit,
  type UnitAnyCase,
  type UnitName,
  weeks,
  type Weeks,
  years,
  type Years,
} from "#index.ts"

// ── Test fixtures ────────────────────────────────────────────────────────────
declare const userInput: string
declare const start: number
declare const choice: "1h" | "30m"

// ── Positive type-level tests ────────────────────────────────────────────────
// Derives each unit alias type from the UNITS table.
{
  expectTypeOf<Years>().toEqualTypeOf<"years" | "year" | "yrs" | "yr" | "y">()
  expectTypeOf<Months>().toEqualTypeOf<"months" | "month" | "mo">()
  expectTypeOf<Weeks>().toEqualTypeOf<"weeks" | "week" | "w">()
  expectTypeOf<Days>().toEqualTypeOf<"days" | "day" | "d">()
  expectTypeOf<Hours>().toEqualTypeOf<"hours" | "hour" | "hrs" | "hr" | "h">()
  expectTypeOf<Minutes>().toEqualTypeOf<"minutes" | "minute" | "mins" | "min" | "m">()
  expectTypeOf<Seconds>().toEqualTypeOf<"seconds" | "second" | "secs" | "sec" | "s">()
  expectTypeOf<Milliseconds>().toEqualTypeOf<
    "milliseconds" | "millisecond" | "msecs" | "msec" | "ms"
  >()
}

// Makes Unit the union of every unit alias type.
{
  expectTypeOf<Unit>().toEqualTypeOf<
    Years | Months | Weeks | Days | Hours | Minutes | Seconds | Milliseconds
  >()
}

// Makes UnitName the union of the long plural unit names.
{
  expectTypeOf<UnitName>().toEqualTypeOf<
    "years" | "months" | "weeks" | "days" | "hours" | "minutes" | "seconds" | "milliseconds"
  >()
  expectTypeOf<UnitName>().toExtend<Unit>()
}

// Makes UnitAnyCase cover lowercase, Capitalized, and UPPERCASE units, except the ambiguous "M".
{
  expectTypeOf<UnitAnyCase>().toEqualTypeOf<
    Exclude<Unit | Capitalize<Unit> | Uppercase<Unit>, "M">
  >()
  expectTypeOf<"ms">().toExtend<UnitAnyCase>()
  expectTypeOf<"Hour">().toExtend<UnitAnyCase>()
  expectTypeOf<"HOURS">().toExtend<UnitAnyCase>()
}

// Accepts bare numbers and units with zero or one space in TimeExpression.
{
  const bare: TimeExpression = "500"
  const compact: TimeExpression = "1h"
  const spaced: TimeExpression = "1 h"
  const long: TimeExpression = "2 hours"
  const signed: TimeExpression = "-1.5d"
  const positive: TimeExpression = "+1h"
  const fractional: TimeExpression = ".5h"
  const exponent: TimeExpression = "1e3ms"
  const capitalized: TimeExpression = "1 Hour"
  const uppercase: TimeExpression = "1HOUR"

  void [bare, compact, spaced, long, signed, positive, fractional, exponent, capitalized, uppercase]
}

// The TimeExpression type alone still lets some strings the runtime rejects through, because it is
// built on `${number}`. The unit functions check the grammar of a literal, so these fail there.
{
  expectTypeOf<"0x10h">().toExtend<TimeExpression>()
  expectTypeOf<"0b1s">().toExtend<TimeExpression>()
  expectTypeOf<"1.h">().toExtend<TimeExpression>()
  expectTypeOf<" 1h">().toExtend<TimeExpression>()
}

// Returns a millisecond Duration from parse, or null from safeParse.
{
  expectTypeOf(parse(userInput)).toEqualTypeOf<Duration<"milliseconds">>()
  expectTypeOf(safeParse(userInput)).toEqualTypeOf<Duration<"milliseconds"> | null>()
  expectTypeOf(parse).parameters.toEqualTypeOf<[value: string]>()
  expectTypeOf(safeParse).parameters.toEqualTypeOf<[value: string]>()
}

// Narrows a string to TimeExpression with isTimeExpression.
{
  if (isTimeExpression(userInput)) {
    expectTypeOf(userInput).toEqualTypeOf<TimeExpression>()

    ms(userInput)
  } else {
    expectTypeOf(userInput).toEqualTypeOf<string>()
  }
}

// Returns a plain boolean from isValidTimeExpression, without narrowing.
{
  expectTypeOf(isValidTimeExpression).returns.toEqualTypeOf<boolean>()

  if (isValidTimeExpression(userInput)) {
    expectTypeOf(userInput).toEqualTypeOf<string>()
  }
}

// Accepts any string and a UnitName in convert, and returns a Duration in that unit.
{
  expectTypeOf(convert(userInput, "minutes")).toEqualTypeOf<Duration<"minutes">>()
  expectTypeOf(convert).parameter(0).toEqualTypeOf<string>()
  expectTypeOf(convert).parameter(1).toEqualTypeOf<UnitName>()
}

// Returns a Duration in each unit helper's own unit.
{
  expectTypeOf(ms("1h")).toEqualTypeOf<Duration<"milliseconds">>()
  expectTypeOf(seconds("1h")).toEqualTypeOf<Duration<"seconds">>()
  expectTypeOf(minutes("1h")).toEqualTypeOf<Duration<"minutes">>()
  expectTypeOf(hours("1h")).toEqualTypeOf<Duration<"hours">>()
  expectTypeOf(days("1h")).toEqualTypeOf<Duration<"days">>()
  expectTypeOf(weeks("1h")).toEqualTypeOf<Duration<"weeks">>()
  expectTypeOf(months("1h")).toEqualTypeOf<Duration<"months">>()
  expectTypeOf(years("1h")).toEqualTypeOf<Duration<"years">>()
}

// Keeps a Duration usable as a number, and arithmetic gives a plain number.
{
  const timeoutMs: number = ms("30s")
  const total = seconds("1m") + seconds("30s")

  expectTypeOf(total).toEqualTypeOf<number>()
  void timeoutMs
}

// Accepts every number form of the strict grammar in a literal.
{
  ms("500")
  ms(".5h")
  ms("-1.5d")
  ms("+1h")
  ms("1e3ms")
  ms("2.5E-1 hours")
  seconds("1 Hour")
  minutes("1HOUR")
  days("1d")
}

// Accepts a TimeExpression that isTimeExpression narrowed, and a union of valid literals.
{
  ms(choice)
  seconds(choice)

  if (isTimeExpression(userInput)) {
    ms(userInput)
  }
}

// Accepts a bare number only where the result is milliseconds.
{
  ms("500")
  convert("500", "milliseconds")
}

// Accepts plain numbers and millisecond Durations in format.
{
  format(5_400_000)
  format(Date.now() - start)
  format(ms("1h"))
  format(parse("1h 30m"))
  format(convert("1h", "milliseconds"))
  format(MS_PER_HOUR * 2)
}

// Types format options and returns string from format.
{
  const units: readonly UnitName[] = ["hours", "minutes"]

  expectTypeOf(format(5_400_000, { long: true, precision: 2, units })).toEqualTypeOf<string>()
  expectTypeOf(format).parameter(1).toEqualTypeOf<FormatOptions | undefined>()
  expectTypeOf<FormatOptions["long"]>().toEqualTypeOf<boolean | undefined>()
  expectTypeOf<FormatOptions["precision"]>().toEqualTypeOf<number | undefined>()
  expectTypeOf<FormatOptions["units"]>().toEqualTypeOf<readonly UnitName[] | undefined>()
}

// Exposes the invalid input on InvalidTimeExpressionError as readonly unknown.
{
  const error = new InvalidTimeExpressionError("1 parsec", "value is not a valid time expression")

  expectTypeOf(error).toExtend<Error>()
  expectTypeOf(error.value).toBeUnknown()
  expectTypeOf(InvalidTimeExpressionError).constructorParameters.toEqualTypeOf<
    [value: unknown, reason: string]
  >()
}

// Types the millisecond constants as numbers.
{
  const constants: readonly number[] = [
    MS_PER_SECOND,
    MS_PER_MINUTE,
    MS_PER_HOUR,
    MS_PER_DAY,
    MS_PER_WEEK,
    MS_PER_MONTH,
    MS_PER_YEAR,
  ]

  void constants
}

// ── Negative type tests ──────────────────────────────────────────────────────
// These verify that invalid usage produces compile-time errors.
// The function bodies never execute — only the type checker matters.

function _negativeTypeTests() {
  // @ts-expect-error -- "parsec" is not a unit
  ms("1 parsec")

  // @ts-expect-error -- a plain string must be narrowed with isTimeExpression first
  ms(userInput)

  // @ts-expect-error -- compound expressions are not a TimeExpression; use convert instead
  seconds("1h 30m")

  // @ts-expect-error -- an empty string is not a TimeExpression
  minutes("")

  // @ts-expect-error -- a unit with no number is not a TimeExpression
  hours("h")

  // @ts-expect-error -- mixed casing is not a TimeExpression
  days("1mS")

  // @ts-expect-error -- trailing whitespace is not a TimeExpression
  weeks("1w ")

  // @ts-expect-error -- a sign must be attached to the number
  months("- 1mo")

  // @ts-expect-error -- Infinity is not a finite number
  years("Infinityy")

  // @ts-expect-error -- "M" is ambiguous: "m" is minutes and "mo" is months
  ms("1M")

  // @ts-expect-error -- a bare number means milliseconds, so seconds() needs a unit
  seconds("30")

  // @ts-expect-error -- a bare number means milliseconds, so years() needs a unit
  years("1")

  // @ts-expect-error -- a decimal point needs a digit after it
  ms("1.h")

  // @ts-expect-error -- leading whitespace is not part of the strict form
  ms(" 1h")

  // @ts-expect-error -- hexadecimal is not part of the number grammar
  seconds("0x10h")

  // @ts-expect-error -- binary is not part of the number grammar
  minutes("0b1s")

  // @ts-expect-error -- a value outside the finite range is not a TimeExpression
  hours("1e400h")

  // @ts-expect-error -- unit helpers take a string, not a number
  ms(1000)

  // @ts-expect-error -- convert takes a UnitName, not a unit alias
  convert("1h", "h")

  // @ts-expect-error -- convert takes a UnitName, not a singular unit
  convert("1h", "minute")

  // @ts-expect-error -- "fortnights" is not a UnitName
  convert("1h", "fortnights")

  // @ts-expect-error -- convert takes a UnitName, not any string
  convert("1h", userInput)

  // @ts-expect-error -- format units must be UnitName values
  format(1000, { units: ["h"] })

  // @ts-expect-error -- format takes a number, not a time expression
  format("1h")

  // @ts-expect-error -- format takes milliseconds, not seconds
  format(seconds("1h"))

  // @ts-expect-error -- format takes milliseconds, not minutes
  format(convert("1h", "minutes"))

  // @ts-expect-error -- precision is a number
  format(1000, { precision: "2" })

  // @ts-expect-error -- isTimeExpression takes a string
  isTimeExpression(1000)

  // @ts-expect-error -- parse takes a string
  parse(1000)

  // @ts-expect-error -- "1 parsec" is not a TimeExpression
  const invalid: TimeExpression = "1 parsec"
  void invalid

  // @ts-expect-error -- "parsec" is not a Unit
  const unit: Unit = "parsec"
  void unit

  const error = new InvalidTimeExpressionError("1 parsec", "value is not a valid time expression")

  // @ts-expect-error -- value is readonly
  error.value = "1h"
}

// Suppress unused function warning — this exists only for type checking
void _negativeTypeTests
