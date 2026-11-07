import type { CronPhrase, Schedule } from "#lib/schedule/index.ts"
import { writePhrase } from "#lib/describe/index.ts"
import { validate } from "#lib/validate/index.ts"
import { withInput } from "./errors"

/**
 * Write a schedule as its canonical cron phrase in the strict form, for display.
 *
 * The phrase uses 24-hour times, the days in calendar order, and the long form of a shortcut.
 * `parse` of the phrase gives the same schedule, with each list of days in calendar order and
 * without duplicates.
 *
 * @example
 *   describe({ between: { from: 9, to: 17 }, every: "minute", interval: 15, on: "weekdays" })
 *   // "every 15 minutes between 9:00 and 17:00 on weekdays"
 *   describe(parse("weekly")) // "every sunday at 0:00"
 *
 * @param schedule - A schedule
 *
 * @returns The cron phrase
 * @throws {InvalidScheduleError} If the schedule is not valid at runtime, such as from JavaScript
 *   or a cast
 */
export function describe(schedule: Schedule): CronPhrase {
  return withInput(schedule, () => writePhrase(validate(schedule)))
}
