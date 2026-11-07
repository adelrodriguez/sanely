import type { Hour, HourInterval, MinuteInterval, WindowEnd } from "#lib/vocabulary/words.ts"
import {
  HOUR_INTERVALS,
  HOURS_PER_DAY,
  MINUTE_INTERVALS,
  MINUTES_PER_HOUR,
  formatChoices,
  isOneOf,
} from "#lib/vocabulary/words.ts"
import type { Window } from "./index.ts"
import { isWindow } from "./index.ts"

/**
 * The keys from the root of a schedule object to the value that failed, such as `["at", "hour"]`. A
 * cron phrase has an empty path.
 */
export type Path = ReadonlyArray<string | number>

/**
 * The reason that an input is not a schedule. The grammar and the validator throw it, and the
 * public functions change it to an `InvalidScheduleError` that also holds the input.
 */
export class ParseError extends Error {
  readonly reason: string
  readonly path: Path

  constructor(reason: string, path: Path = []) {
    super(reason)
    this.name = "ParseError"
    this.reason = reason
    this.path = path
  }
}

// `JSON.stringify` returns `undefined` for `undefined`, a function, and a symbol, but its type
// is `string`.
function toJson(value: unknown): string | undefined {
  return JSON.stringify(value)
}

/**
 * A value as text for a reason or a message, such as `"weekday"`, `25`, or `{"hour":9}`. A value
 * that cannot become JSON or a string, such as an object with a broken `toString`, still gives a
 * text.
 */
export function show(value: unknown): string {
  try {
    return toJson(value) ?? String(value)
  } catch {
    try {
      return String(value)
    } catch {
      return Object.prototype.toString.call(value)
    }
  }
}

/**
 * Stop with a reason.
 */
export function fail(reason: string, path: Path = []): never {
  throw new ParseError(reason, path)
}

// An interval that is not a divisor of the cycle has gaps of two lengths, so one cron expression
// cannot express it.
function failInterval(
  value: number,
  unit: string,
  cycle: number,
  intervals: readonly number[],
  path: Path
): never {
  const choices = `Use ${formatChoices(intervals)}`
  if (value < cycle) fail(`${value} does not divide ${cycle}. ${choices}`, path)
  return fail(`${value} ${unit} has no exact single cron. ${choices}`, path)
}

/**
 * Check a minute interval from 2 up. The caller handles 1 and 60, because the advice for them
 * depends on the input form.
 */
export function toMinuteInterval(value: number, path: Path = []): MinuteInterval {
  if (isOneOf(MINUTE_INTERVALS, value)) return value
  return failInterval(value, "minutes", MINUTES_PER_HOUR, MINUTE_INTERVALS, path)
}

/**
 * Check an hour interval from 2 up. The caller handles 1 and 24.
 */
export function toHourInterval(value: number, path: Path = []): HourInterval {
  if (isOneOf(HOUR_INTERVALS, value)) return value
  return failInterval(value, "hours", HOURS_PER_DAY, HOUR_INTERVALS, path)
}

/**
 * Check that a window ends after it starts.
 */
export function toWindow(from: Hour, to: WindowEnd, path: Path = []): Window {
  const window = { from, to }
  if (!isWindow(window)) fail("the window must end after it starts", path)
  return window
}
