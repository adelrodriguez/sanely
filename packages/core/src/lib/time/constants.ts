/**
 * Minutes in one hour.
 */
export const MINUTES_PER_HOUR = 60

/**
 * Hours in one nominal day.
 */
export const HOURS_PER_DAY = 24

/**
 * Milliseconds in one second (`1_000`).
 */
export const MS_PER_SECOND = 1000

/**
 * Milliseconds in one minute (`60_000`).
 */
export const MS_PER_MINUTE: number = MS_PER_SECOND * 60

/**
 * Milliseconds in one hour (`3_600_000`).
 */
export const MS_PER_HOUR: number = MS_PER_MINUTE * MINUTES_PER_HOUR

/**
 * Milliseconds in one day (`86_400_000`).
 */
export const MS_PER_DAY: number = MS_PER_HOUR * HOURS_PER_DAY

/**
 * Milliseconds in one week (`604_800_000`).
 */
export const MS_PER_WEEK: number = MS_PER_DAY * 7

/**
 * Milliseconds in one year (`31_557_600_000`), based on 365.25 days.
 */
export const MS_PER_YEAR: number = MS_PER_DAY * 365.25

/**
 * Milliseconds in one month (`2_629_800_000`), derived as one twelfth of a year.
 */
export const MS_PER_MONTH: number = MS_PER_YEAR / 12
