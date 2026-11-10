import type { AmbiguousUnit, AmbiguousUnitHint, UnitAnyCase } from "@sanely/core/time"

/**
 * A single time expression in strict form: a bare number (interpreted as milliseconds), or a number
 * followed by a unit (with or without one space).
 *
 * This type is a best-effort compile-time check of the strict grammar. It is built on `${number}`,
 * so it also accepts some strings that the strict grammar rejects, such as `"0x10h"` or `" 1h"`.
 * `isTimeExpression` is the exact runtime check and accepts a strict subset of this type. `parse`
 * accepts a lenient superset of the strict grammar (flexible whitespace and any unit casing).
 */
export type TimeExpression = `${number}` | `${number}${UnitAnyCase}` | `${number} ${UnitAnyCase}`

/**
 * A `TimeExpression` with a unit. A bare number means milliseconds, so the unit functions other
 * than `ms` take this type.
 */
export type TimeExpressionWithUnit = Exclude<TimeExpression, `${number}`>

/**
 * Whether a time expression may be a bare number: `"bare"` when the result is milliseconds, and
 * `"unit"` when the expression needs a unit.
 */
export type UnitRule = "bare" | "unit"

/**
 * Check a time expression in the strict form at compile time. A valid literal gives itself, and an
 * invalid literal gives the reason as a string. A `TimeExpression` that `isTimeExpression` narrowed
 * is valid, and a plain `string` is not.
 *
 * This checks the exact number grammar, so it rejects strings such as `"1.h"` and `"0x10h"` that
 * the `TimeExpression` type alone accepts.
 */
export type ValidateTimeExpression<
  T extends string,
  Rule extends UnitRule = "bare",
> = T extends unknown
  ? // A member that is not a literal, such as `string` or `${number}h`, gives an index signature
    // in `Record<T, 1>`, so `{}` extends it. A literal gives a required property.
    // oxlint-disable-next-line typescript/no-empty-object-type
    {} extends Record<T, 1>
    ? T extends AllowedBy<Rule>
      ? T
      : NotChecked<Rule>
    : CheckLiteral<T, Rule> extends infer Reason extends string
      ? [Reason] extends [never]
        ? T
        : Reason
      : never
  : never

type AllowedBy<Rule extends UnitRule> = Rule extends "unit"
  ? TimeExpressionWithUnit
  : TimeExpression

type NotChecked<Rule extends UnitRule> = Rule extends "unit"
  ? "Use convert(value, unit) for a string at runtime. A literal needs a unit, because a bare number means milliseconds."
  : "Check a string with isTimeExpression first, or use parse() for a string at runtime."

type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"

// Remove leading digits. The result is whether there was a digit, and the rest of the string.
type TakeDigits<S extends string, Seen extends boolean = false> = S extends `${Digit}${infer Rest}`
  ? TakeDigits<Rest, true>
  : [Seen, S]

// Remove an optional exponent. The result is the rest of the string, or a reason.
type TakeExponent<S extends string> = S extends `${"e" | "E"}${infer Exponent}`
  ? TakeDigits<Exponent extends `${"+" | "-"}${infer Digits}` ? Digits : Exponent> extends [
      true,
      infer Rest extends string,
    ]
    ? { rest: Rest }
    : { reason: "an exponent needs at least one digit" }
  : { rest: S }

// Remove the number: `\d*\.?\d+([eE][+-]?\d+)?` after an optional sign.
type TakeNumber<S extends string> =
  TakeDigits<S extends `${"+" | "-"}${infer Unsigned}` ? Unsigned : S> extends [
    infer Whole extends boolean,
    infer Rest extends string,
  ]
    ? Rest extends `.${infer Fraction}`
      ? TakeDigits<Fraction> extends [true, infer AfterFraction extends string]
        ? TakeExponent<AfterFraction>
        : { reason: "a decimal point needs a digit after it" }
      : Whole extends true
        ? TakeExponent<Rest>
        : { reason: "a time expression starts with a number" }
    : never

type CheckUnit<Unit extends string, Rule extends UnitRule> = Unit extends ""
  ? Rule extends "unit"
    ? 'a number without a unit means milliseconds. Add a unit, such as "30s" or "30ms"'
    : never
  : Unit extends UnitAnyCase | ` ${UnitAnyCase}`
    ? never
    : (Unit extends ` ${infer Token}` ? Token : Unit) extends infer Token extends AmbiguousUnit
      ? `"${Token}" is ambiguous: ${AmbiguousUnitHint<Token>}`
      : `"${Unit}" is not a unit, or has more than one space before it`

// Gives `never` for a valid literal, or the reason it is invalid.
type CheckLiteral<T extends string, Rule extends UnitRule> =
  TakeNumber<T> extends { reason: infer Reason extends string }
    ? `"${T}": ${Reason}`
    : TakeNumber<T> extends { rest: infer Unit extends string }
      ? CheckUnit<Unit, Rule> extends infer Reason extends string
        ? [Reason] extends [never]
          ? T extends AllowedBy<Rule>
            ? never
            : `"${T}": the number is outside the finite range`
          : `"${T}": ${Reason}`
        : never
      : never
