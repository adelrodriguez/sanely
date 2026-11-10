import type { UnitName } from "@sanely/core/time"

/**
 * A number of the given unit, such as the result of `seconds("1h")`. It is still a `number`, so any
 * API that takes a number accepts it. Arithmetic on it gives a plain `number`.
 *
 * The unit lets `format` reject a value in the wrong unit: `format(seconds("1h"))` is a type error,
 * because `format` takes milliseconds.
 */
export type Duration<U extends UnitName> = number & { readonly __unit: U }

/**
 * Tag a number with the unit it is in. This is the only place that creates a `Duration`.
 */
export function toDuration<U extends UnitName>(value: number): Duration<U> {
  // The unit exists only in the type system.
  return value as Duration<U>
}

/**
 * Accepts a plain number or a millisecond `Duration`. A `Duration` in another unit gives the reason
 * it is rejected.
 */
export type MillisecondsOnly<T extends number> = T extends { readonly __unit: infer U }
  ? U extends "milliseconds"
    ? T
    : `format takes milliseconds, not ${U & string}. Get milliseconds from ms() or parse() instead.`
  : T
