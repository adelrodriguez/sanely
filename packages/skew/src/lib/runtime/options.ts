import { safeParse } from "@sanely/duration"

// Browsers and Node.js store a timer delay as a signed 32-bit integer, so a longer delay fires
// after 1 ms.
const MAX_TIMER_DELAY = 2 ** 31 - 1

export class InvalidOptionError extends Error {
  override readonly name = "InvalidOptionError"
  readonly option: string
  readonly value: unknown

  constructor(option: string, value: unknown, expected: string) {
    super(`Expected ${option} to be ${expected}, received ${String(value)}`)
    this.option = option
    this.value = value
  }
}

/**
 * Reads a length of time given in milliseconds or as a time expression, such as `"5m"`. Throws
 * `InvalidOptionError` unless it is a whole number of milliseconds that a timer can wait for.
 */
export function milliseconds(option: string, value: number | string): number {
  const parsed = typeof value === "number" ? value : wholeMilliseconds(safeParse(value))

  if (parsed === null || !Number.isSafeInteger(parsed) || parsed <= 0 || parsed > MAX_TIMER_DELAY) {
    throw new InvalidOptionError(
      option,
      value,
      `a whole number of milliseconds from 1 to ${MAX_TIMER_DELAY}, or a time expression for one`
    )
  }

  return parsed
}

/**
 * Decimal arithmetic can leave a time expression a fraction of a unit of precision away from the
 * whole number it names. For example, `"1.1h"` parses to `3960000.0000000005`. Rounds a value that
 * close to a whole number, and returns any other value unchanged.
 */
function wholeMilliseconds(parsed: number | null): number | null {
  if (parsed === null) {
    return null
  }

  const whole = Math.round(parsed)
  return Math.abs(parsed - whole) <= whole * Number.EPSILON ? whole : parsed
}
