import { parse } from "@sanely/duration"

/**
 * Reads a length of time given in milliseconds or as a time expression, such as `"5m"`. Throws
 * `InvalidTimeExpressionError` from `@sanely/duration` for a string that is not one.
 */
export function milliseconds(value: number | string): number {
  return typeof value === "number" ? value : parse(value)
}
