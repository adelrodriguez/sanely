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
export const MS_PER_HOUR: number = MS_PER_MINUTE * 60

/**
 * Milliseconds in one day (`86_400_000`).
 */
export const MS_PER_DAY: number = MS_PER_HOUR * 24

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
