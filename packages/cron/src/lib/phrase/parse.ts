import type { Schedule } from "#lib/schedule/schedule.ts"
import { parsePhrase } from "#lib/grammar/grammar.ts"
import { normalize } from "#lib/normalize/normalize.ts"
import { ParseError, fail, show } from "#lib/schedule/rules.ts"
import { validate } from "#lib/validate/validate.ts"
import { withInput } from "./errors"

// A string is a cron phrase, and any other object is a schedule object.
function read(value: unknown): Schedule {
  if (typeof value === "string") return parsePhrase(normalize(value))
  if (typeof value !== "object" || value === null) {
    fail(`${show(value)} is not a cron phrase or a schedule object`)
  }
  return validate(value)
}

/**
 * Parse input at runtime to a `Schedule`.
 *
 * - A string is a cron phrase in the strict form or the lenient form. The lenient form accepts any
 *   case, extra whitespace, and aliases such as `mins` and `mon`.
 * - An object is a schedule object, such as one from `JSON.parse`. Each key must be a key of its kind
 *   of schedule.
 *
 * @example
 *   parse("Every 15 Mins On Weekdays") // { every: "minute", interval: 15, on: "weekdays" }
 *   parse({ every: "day", at: { hour: 9, minute: 30 } }) // the same object
 *   parse("every 7 minutes") // throws: 7 does not divide 60
 *
 * @param value - A cron phrase or a schedule object
 *
 * @returns The schedule
 * @throws {InvalidScheduleError} If the value is not a valid schedule
 */
export function parse(value: unknown): Schedule {
  return withInput(value, () => read(value))
}

/**
 * The same as `parse`, but returns `null` for a value that is not a valid schedule.
 *
 * @example
 *   safeParse("every 2 hours") // { every: "hour", interval: 2 }
 *   safeParse("every 90 minutes") // null
 *
 * @param value - A cron phrase or a schedule object
 *
 * @returns The schedule, or `null`
 */
export function safeParse(value: unknown): Schedule | null {
  try {
    return read(value)
  } catch (error) {
    if (error instanceof ParseError) return null
    throw error
  }
}

/**
 * Check whether a value is a schedule object. A cron phrase is not a schedule object: use
 * `safeParse` for a string.
 *
 * @example
 *   isSchedule({ every: "hour" }) // true
 *   isSchedule({ every: "minute", interval: 7 }) // false
 *   isSchedule("every hour") // false
 *
 * @param value - Any value
 *
 * @returns `true` if `value` is a `Schedule`
 */
export function isSchedule(value: unknown): value is Schedule {
  try {
    validate(value)
    return true
  } catch (error) {
    if (error instanceof ParseError) return false
    throw error
  }
}
