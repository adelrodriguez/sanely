/**
 * The names of the five cron fields, in cron order.
 */
export type CronFieldName = "minute" | "hour" | "dayOfMonth" | "month" | "dayOfWeek"

/**
 * A schedule: one sorted set of values for each cron field. A run happens at each time that matches
 * all five fields.
 *
 * The language never restricts both `dayOfMonth` and `dayOfWeek`, because cron selects a day that
 * matches either field when both are restricted.
 */
export type Schedule = Readonly<Record<CronFieldName, readonly number[]>>

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
 * A schedule that runs every minute. Each sentence shape restricts some of its fields.
 */
export function createSchedule(fields: Partial<Schedule>): Schedule {
  return {
    dayOfMonth: fields.dayOfMonth ?? every("dayOfMonth"),
    dayOfWeek: (fields.dayOfWeek ?? every("dayOfWeek")).toSorted((a, b) => a - b),
    hour: fields.hour ?? every("hour"),
    minute: fields.minute ?? every("minute"),
    month: fields.month ?? every("month"),
  }
}
