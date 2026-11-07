import type { ValidateCronPhrase } from "#lib/grammar/types.ts"
import { parse } from "./parse"

/**
 * Convert a cron phrase to a standard 5-field cron expression.
 *
 * The phrase must be a `CronPhrase`: a string literal in the strict form, or a value that
 * `isCronPhrase` narrowed. An invalid literal is a type error with the reason. A plain `string` is
 * also a type error: use `parse`, or narrow it with `isCronPhrase` first.
 *
 * @example
 *   cron("every 15 minutes") // "*\/15 * * * *"
 *   cron("every weekday at 17:30") // "30 17 * * 1-5"
 *   cron("on the 1st of every month at 8:00") // "0 8 1 * *"
 *   cron("every 7 minutes") // Type error: 7 does not divide 60
 *
 * @param phrase - A cron phrase in the strict form
 *
 * @returns The cron expression
 * @throws {InvalidCronPhraseError} If the phrase is not valid at runtime
 */
export function cron<T extends string>(phrase: ValidateCronPhrase<T>): string {
  return parse(phrase)
}
