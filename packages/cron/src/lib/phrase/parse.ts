import type { Schedule } from "#lib/schedule/schedule.ts"
import { toFields } from "#lib/fields/fields.ts"
import { parsePhrase } from "#lib/grammar/grammar.ts"
import { normalize } from "#lib/normalize/normalize.ts"
import { fail } from "#lib/schedule/rules.ts"
import { serialize } from "#lib/serialize/serialize.ts"
import { withInput } from "./errors"

/**
 * Parse a value in the lenient form: normalize it, then parse it with the strict grammar.
 *
 * @throws {InvalidScheduleError} If the value is not a valid cron phrase
 */
export function parseLenient(value: unknown): Schedule {
  return withInput(value, () => {
    if (typeof value !== "string") return fail("the value is not a string")
    return parsePhrase(normalize(value))
  })
}

/**
 * Parse a cron phrase in the strict form or the lenient form, and return a standard 5-field cron
 * expression.
 *
 * @throws {InvalidScheduleError} If the value is not a valid cron phrase
 */
export function parse(value: string): string {
  return serialize(toFields(parseLenient(value)))
}

/**
 * Parse a cron phrase in the strict form or the lenient form without throwing.
 *
 * @returns The cron expression, or `null` if the value is not a valid cron phrase
 */
export function safeParse(value: string): string | null {
  try {
    return parse(value)
  } catch {
    return null
  }
}
