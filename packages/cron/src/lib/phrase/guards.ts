import type { CronPhrase } from "#lib/grammar/types.ts"
import { parseStrict } from "#lib/grammar/grammar.ts"
import { parseLenient } from "./parse"

/**
 * Check whether a value is a cron phrase in the strict form, without throwing.
 *
 * Acts as a TypeScript type guard: when it returns `true`, the value is narrowed to `CronPhrase`.
 * It rejects the lenient form (for example `"Every 15 Mins"`), even though `parse` accepts it. A
 * narrowed value is a valid argument of `cron`.
 *
 * @example
 *   isCronPhrase("every 15 minutes") // true
 *   isCronPhrase("Every 15 Mins") // false (lenient form)
 *   isCronPhrase("every 7 minutes") // false
 *
 * @param value - The value to check
 *
 * @returns `true` if the value is a cron phrase in the strict form
 */
export function isCronPhrase(value: string): value is CronPhrase {
  return typeof value === "string" && parseStrict(value).ok
}

/**
 * Check whether `parse` accepts a value (strict form or lenient form), without throwing.
 *
 * This does not narrow the type. Use `safeParse` when you also need the cron expression.
 *
 * @example
 *   isValidCronPhrase("every 15 minutes") // true
 *   isValidCronPhrase("Every 15 Mins") // true
 *   isValidCronPhrase("every 7 minutes") // false
 *
 * @param value - The value to check
 *
 * @returns `true` if `parse` accepts the value
 */
export function isValidCronPhrase(value: string): boolean {
  return parseLenient(value).ok
}
