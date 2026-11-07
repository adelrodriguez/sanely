import type { CronPhrase } from "#lib/schedule/schedule.ts"
import { parsePhrase } from "#lib/grammar/grammar.ts"
import { safeParse } from "./parse"

/**
 * Check whether a value is a cron phrase in the strict form, without throwing.
 */
export function isCronPhrase(value: string): value is CronPhrase {
  if (typeof value !== "string") return false
  try {
    parsePhrase(value)
    return true
  } catch {
    return false
  }
}

/**
 * Check whether `parse` accepts a string (strict form or lenient form), without throwing.
 */
export function isValidCronPhrase(value: string): boolean {
  return typeof value === "string" && safeParse(value) !== null
}
