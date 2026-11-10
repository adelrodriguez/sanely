import { getUnitByName, type UnitName } from "@sanely/core/time"
import type { ValidateTimeExpression } from "#lib/expression/types.ts"
import { InvalidTimeExpressionError } from "#lib/expression/errors.ts"
import { parseExpression } from "#lib/expression/parse.ts"
import { type Duration, toDuration } from "#lib/shared/duration.ts"

/**
 * Parse a time expression string and convert the result into the given unit.
 *
 * This is the generic primitive behind the typed unit functions (`ms`, `seconds`, `minutes`, and
 * the rest). Use it when the input is a plain string — for example a compound expression such as
 * `"1h 30m"`, which the `TimeExpression` type does not cover.
 *
 * A bare number (no unit) means milliseconds, so it is valid only when `unit` is `"milliseconds"`.
 *
 * @example
 *   convert("1h 30m", "minutes") // 90
 *   convert("90s", "minutes") // 1.5
 *   convert("1 day, 6 hours", "hours") // 30
 *
 * @param value - A time expression string (simple or compound)
 * @param unit - The output unit name (e.g. `"seconds"`)
 *
 * @returns The value expressed in the given unit, as a `Duration` in that unit
 * @throws {InvalidTimeExpressionError} If the expression cannot be parsed, or if it is a bare
 *   number and `unit` is not `"milliseconds"`
 * @throws {RangeError} If the unit name is not a supported unit
 */
export function convert<U extends UnitName>(value: string, unit: U): Duration<U> {
  const definition = getUnitByName(unit)

  if (!definition) {
    throw new RangeError(`Unknown unit name provided to convert(). Received: ${String(unit)}`)
  }

  const { isBare, milliseconds } = parseExpression(value)

  // A bare number means milliseconds, so in any other unit it is almost always a missing unit.
  if (isBare && unit !== "milliseconds") {
    throw new InvalidTimeExpressionError(
      value,
      'a number without a unit means milliseconds. Add a unit, such as "30s" or "30ms"'
    )
  }

  return toDuration<U>(milliseconds / definition.ms)
}

/**
 * Parse a time expression and return the value in milliseconds. A bare number is milliseconds.
 *
 * @example
 *   ms("1s") // 1000
 *   ms("5m") // 300_000
 *   ms("1h") // 3_600_000
 *
 * @param value - A time expression string
 *
 * @returns The value in milliseconds
 */
export function ms<const T extends string>(
  value: ValidateTimeExpression<T>
): Duration<"milliseconds"> {
  return convert(value, "milliseconds")
}

/**
 * Parse a time expression and return the value in seconds. The expression needs a unit: a bare
 * number means milliseconds, so it is a type error here.
 *
 * @example
 *   seconds("1h") // 3600
 *   seconds("500ms") // 0.5
 *
 * @param value - A time expression string
 *
 * @returns The value in seconds
 */
export function seconds<const T extends string>(
  value: ValidateTimeExpression<T, "unit">
): Duration<"seconds"> {
  return convert(value, "seconds")
}

/**
 * Parse a time expression and return the value in minutes. The expression needs a unit: a bare
 * number means milliseconds, so it is a type error here.
 *
 * @example
 *   minutes("2h") // 120
 *   minutes("30s") // 0.5
 *
 * @param value - A time expression string
 *
 * @returns The value in minutes
 */
export function minutes<const T extends string>(
  value: ValidateTimeExpression<T, "unit">
): Duration<"minutes"> {
  return convert(value, "minutes")
}

/**
 * Parse a time expression and return the value in hours. The expression needs a unit: a bare number
 * means milliseconds, so it is a type error here.
 *
 * @example
 *   hours("1d") // 24
 *   hours("30m") // 0.5
 *
 * @param value - A time expression string
 *
 * @returns The value in hours
 */
export function hours<const T extends string>(
  value: ValidateTimeExpression<T, "unit">
): Duration<"hours"> {
  return convert(value, "hours")
}

/**
 * Parse a time expression and return the value in days. The expression needs a unit: a bare number
 * means milliseconds, so it is a type error here.
 *
 * @example
 *   days("1w") // 7
 *   days("12h") // 0.5
 *
 * @param value - A time expression string
 *
 * @returns The value in days
 */
export function days<const T extends string>(
  value: ValidateTimeExpression<T, "unit">
): Duration<"days"> {
  return convert(value, "days")
}

/**
 * Parse a time expression and return the value in weeks. The expression needs a unit: a bare number
 * means milliseconds, so it is a type error here.
 *
 * @example
 *   weeks("14d") // 2
 *   weeks("1y") // 52.1775
 *
 * @param value - A time expression string
 *
 * @returns The value in weeks
 */
export function weeks<const T extends string>(
  value: ValidateTimeExpression<T, "unit">
): Duration<"weeks"> {
  return convert(value, "weeks")
}

/**
 * Parse a time expression and return the value in months. The expression needs a unit: a bare
 * number means milliseconds, so it is a type error here.
 *
 * @example
 *   months("1y") // 12
 *   months("60d") // ~1.97
 *
 * @param value - A time expression string
 *
 * @returns The value in months
 */
export function months<const T extends string>(
  value: ValidateTimeExpression<T, "unit">
): Duration<"months"> {
  return convert(value, "months")
}

/**
 * Parse a time expression and return the value in years. The expression needs a unit: a bare number
 * means milliseconds, so it is a type error here.
 *
 * @example
 *   years("365.25d") // 1
 *   years("6mo") // 0.5
 *
 * @param value - A time expression string
 *
 * @returns The value in years
 */
export function years<const T extends string>(
  value: ValidateTimeExpression<T, "unit">
): Duration<"years"> {
  return convert(value, "years")
}
