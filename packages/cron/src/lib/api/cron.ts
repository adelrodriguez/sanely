import type { ValidateCronPhrase } from "#lib/grammar/types.ts"
import type { CronExpression, Schedule } from "#lib/schedule/schedule.ts"
import { toFields } from "#lib/fields/fields.ts"
import { serialize } from "#lib/serialize/serialize.ts"
import { parse } from "./parse"

/**
 * Convert a schedule to a standard 5-field cron expression.
 *
 * The input is a `Schedule` object, or a cron phrase in a string literal. The type checker checks
 * both: an invalid phrase is a type error with the reason. A plain `string` is also a type error.
 * Use `parse` for a string at runtime.
 *
 * @example
 *   cron("every 15 minutes between 9:00 and 17:00 on weekdays") // "*\/15 9-16 * * 1-5"
 *   cron({ at: { hour: 17, minute: 30 }, every: "day", on: ["monday", "friday"] }) // "30 17 * * 1,5"
 *   cron("every 7 minutes") // Type error: 7 does not divide 60
 *
 * @param input - A `Schedule`, or a cron phrase in the strict form
 *
 * @returns The cron expression
 * @throws {InvalidScheduleError} If the input is not valid at runtime, such as from JavaScript or a
 *   cast
 */
export function cron<const T extends string | Schedule>(
  input: T extends string ? ValidateCronPhrase<T> : Schedule
): CronExpression {
  return serialize(toFields(parse(input)))
}
