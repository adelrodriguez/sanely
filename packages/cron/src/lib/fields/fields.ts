import type { ByKind, DaySet, Schedule } from "#lib/schedule/schedule.ts"
import { match } from "#lib/schedule/schedule.ts"
import { DAY_GROUPS, DAYS } from "#lib/vocabulary/words.ts"

/**
 * The names of the five cron fields, in cron order.
 */
export type CronFieldName = "minute" | "hour" | "dayOfMonth" | "month" | "dayOfWeek"

/**
 * The cron fields: one sorted set of values for each cron field. A run happens at each time that
 * matches all five fields.
 */
export type Fields = Readonly<Record<CronFieldName, readonly number[]>>

/**
 * The lowest and highest value of each cron field.
 */
export const FIELD_RANGES: Readonly<Record<CronFieldName, readonly [number, number]>> = {
  dayOfMonth: [1, 31],
  dayOfWeek: [0, 6],
  hour: [0, 23],
  minute: [0, 59],
  month: [1, 12],
}

/**
 * The values from `start` to `end` (both included), with a step.
 */
export function range(start: number, end: number, step = 1): number[] {
  const values: number[] = []
  for (let value = start; value <= end; value += step) values.push(value)
  return values
}

/**
 * All values of a cron field.
 */
export function every(field: CronFieldName): number[] {
  const [start, end] = FIELD_RANGES[field]
  return range(start, end)
}

/**
 * Cron fields that run every minute, with some fields restricted.
 */
export function createFields(fields: Partial<Fields>): Fields {
  return {
    dayOfMonth: fields.dayOfMonth ?? every("dayOfMonth"),
    dayOfWeek: (fields.dayOfWeek ?? every("dayOfWeek")).toSorted((a, b) => a - b),
    hour: fields.hour ?? every("hour"),
    minute: fields.minute ?? every("minute"),
    month: fields.month ?? every("month"),
  }
}

// The cron day numbers of a day set, without duplicates. No day set is every day.
function getDaysOfWeek(on: DaySet | undefined): number[] {
  if (on === undefined) return every("dayOfWeek")
  const days = typeof on === "string" ? DAY_GROUPS[on].days : on
  return [...new Set(days.map((day) => DAYS[day].cron))]
}

const FIELDS_BY_KIND = {
  day: ({ at, on }) =>
    createFields({ dayOfWeek: getDaysOfWeek(on), hour: [at.hour], minute: [at.minute] }),
  hour: ({ interval = 1, on }) =>
    createFields({
      dayOfWeek: getDaysOfWeek(on),
      hour: range(...FIELD_RANGES.hour, interval),
      minute: [0],
    }),
  minute: ({ between, interval = 1, on }) =>
    createFields({
      dayOfWeek: getDaysOfWeek(on),
      hour: between ? range(between.from, between.to - 1) : every("hour"),
      minute: range(...FIELD_RANGES.minute, interval),
    }),
  month: ({ at, day }) => createFields({ dayOfMonth: [day], hour: [at.hour], minute: [at.minute] }),
} satisfies ByKind<Fields>

/**
 * The cron fields of a schedule. A minute interval starts at :00 of each hour, and an hour interval
 * starts at 00:00 of each day. A window end is not included.
 */
export function toFields(schedule: Schedule): Fields {
  return match(schedule, FIELDS_BY_KIND)
}
