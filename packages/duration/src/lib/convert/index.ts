import { getUnitByName, type UnitName } from "@sanely/core/time"
import type { TimeExpression } from "#lib/expression/types.ts"
import { parse } from "#lib/expression/parse.ts"

/**
 * Parse a time expression string and convert the result into the given unit.
 *
 * This is the generic primitive behind the typed unit functions (`ms`, `seconds`, `minutes`, and
 * the rest). Use it when the input is a plain string — for example a compound expression such as
 * `"1h 30m"`, which the `TimeExpression` type does not cover.
 *
 * A bare number (no unit) in the expression is interpreted as milliseconds.
 *
 * @example
 *   convert("1h 30m", "minutes") // 90
 *   convert("90s", "minutes") // 1.5
 *   convert("1 day, 6 hours", "hours") // 30
 *
 * @param value - A time expression string (simple or compound)
 * @param unit - The output unit name (e.g. `"seconds"`)
 *
 * @returns The value expressed in the given unit
 * @throws {InvalidTimeExpressionError} If the expression cannot be parsed
 * @throws {RangeError} If the unit name is not a supported unit
 */
export function convert(value: string, unit: UnitName): number {
  const definition = getUnitByName(unit)

  if (!definition) {
    throw new RangeError(`Unknown unit name provided to convert(). Received: ${String(unit)}`)
  }

  return parse(value) / definition.ms
}

/**
 * Parse a time expression and return the value in milliseconds. A bare number is interpreted as
 * milliseconds.
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
export function ms(value: TimeExpression): number {
  return convert(value, "milliseconds")
}

/**
 * Parse a time expression and return the value in seconds. A bare number is interpreted as
 * milliseconds.
 *
 * @example
 *   seconds("1h") // 3600
 *   seconds("500ms") // 0.5
 *
 * @param value - A time expression string
 *
 * @returns The value in seconds
 */
export function seconds(value: TimeExpression): number {
  return convert(value, "seconds")
}

/**
 * Parse a time expression and return the value in minutes. A bare number is interpreted as
 * milliseconds.
 *
 * @example
 *   minutes("2h") // 120
 *   minutes("30s") // 0.5
 *
 * @param value - A time expression string
 *
 * @returns The value in minutes
 */
export function minutes(value: TimeExpression): number {
  return convert(value, "minutes")
}

/**
 * Parse a time expression and return the value in hours. A bare number is interpreted as
 * milliseconds.
 *
 * @example
 *   hours("1d") // 24
 *   hours("30m") // 0.5
 *
 * @param value - A time expression string
 *
 * @returns The value in hours
 */
export function hours(value: TimeExpression): number {
  return convert(value, "hours")
}

/**
 * Parse a time expression and return the value in days. A bare number is interpreted as
 * milliseconds.
 *
 * @example
 *   days("1w") // 7
 *   days("12h") // 0.5
 *
 * @param value - A time expression string
 *
 * @returns The value in days
 */
export function days(value: TimeExpression): number {
  return convert(value, "days")
}

/**
 * Parse a time expression and return the value in weeks. A bare number is interpreted as
 * milliseconds.
 *
 * @example
 *   weeks("14d") // 2
 *   weeks("1y") // 52.1775
 *
 * @param value - A time expression string
 *
 * @returns The value in weeks
 */
export function weeks(value: TimeExpression): number {
  return convert(value, "weeks")
}

/**
 * Parse a time expression and return the value in months. A bare number is interpreted as
 * milliseconds.
 *
 * @example
 *   months("1y") // 12
 *   months("60d") // ~1.97
 *
 * @param value - A time expression string
 *
 * @returns The value in months
 */
export function months(value: TimeExpression): number {
  return convert(value, "months")
}

/**
 * Parse a time expression and return the value in years. A bare number is interpreted as
 * milliseconds.
 *
 * @example
 *   years("365.25d") // 1
 *   years("6mo") // 0.5
 *
 * @param value - A time expression string
 *
 * @returns The value in years
 */
export function years(value: TimeExpression): number {
  return convert(value, "years")
}
