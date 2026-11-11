import { safeParse } from "@sanely/duration"

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

export function positiveInteger(option: string, value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new InvalidOptionError(option, value, "a positive integer")
  }

  return value
}

// Header values quote names, so a name must be printable ASCII.
export function printable(option: string, value: string) {
  if (!/^[ -~]+$/u.test(value)) {
    throw new InvalidOptionError(option, value, "a non-empty string of printable ASCII characters")
  }

  return value
}

/**
 * Reads a length of time given in milliseconds or as a time expression, such as `"1h"`.
 */
export function milliseconds(option: string, value: number | string) {
  if (typeof value === "number") return positiveInteger(option, value)

  const parsed = safeParse(value)

  if (parsed === null || !Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new InvalidOptionError(
      option,
      value,
      "a time expression for a positive whole number of milliseconds"
    )
  }

  return parsed
}
