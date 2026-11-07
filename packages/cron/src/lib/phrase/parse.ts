import type { GrammarResult } from "#lib/grammar/grammar.ts"
import { parseStrict } from "#lib/grammar/grammar.ts"
import { normalize } from "#lib/normalize/normalize.ts"
import { serialize } from "#lib/serialize/serialize.ts"
import { InvalidCronPhraseError } from "./errors"

/**
 * Parse a value in the lenient form: normalize it, then parse it with the strict grammar.
 */
export function parseLenient(value: unknown): GrammarResult {
  if (typeof value !== "string") return { ok: false, reason: "the value is not a string" }
  return parseStrict(normalize(value))
}

/**
 * Parse a cron phrase in the strict form or the lenient form, and return a standard 5-field cron
 * expression.
 *
 * Use `parse` for a value that is a plain `string`, such as input from a config file or a form. The
 * lenient form accepts any case, extra whitespace, and aliases such as `mins` and `mon`. For a cron
 * phrase in your code, use `cron`: it also checks the phrase at compile time.
 *
 * @example
 *   parse("every 15 minutes") // "*\/15 * * * *"
 *   parse("Every Mon, Wed and Fri at 9:30 PM") // "30 21 * * 1,3,5"
 *   parse("every 7 minutes") // throws: 7 does not divide 60
 *
 * @param value - A cron phrase
 *
 * @returns The cron expression
 * @throws {InvalidCronPhraseError} If the value is not a string, is not a valid cron phrase, or has
 *   no exact cron
 */
export function parse(value: string): string {
  const result = parseLenient(value)
  if (!result.ok) throw new InvalidCronPhraseError(value, result.reason)
  return serialize(result.fields)
}

/**
 * Parse a cron phrase in the strict form or the lenient form without throwing.
 *
 * @example
 *   safeParse("every 2 hours") // "0 *\/2 * * *"
 *   safeParse("every 90 minutes") // null
 *
 * @param value - A cron phrase
 *
 * @returns The cron expression, or `null` if the value is not a valid cron phrase
 */
export function safeParse(value: string): string | null {
  const result = parseLenient(value)
  return result.ok ? serialize(result.fields) : null
}
