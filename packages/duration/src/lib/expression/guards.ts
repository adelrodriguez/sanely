import type { TimeExpression } from "./types"
import { NUMBER_PATTERN, STRICT_UNIT_PATTERN } from "./grammar"
import { safeParse } from "./parse"

// The strict grammar: one optional sign, a number, at most one space, and a unit in lowercase,
// Capitalized, or UPPERCASE form. This is a strict subset of the TimeExpression type, because
// `${number}` also accepts forms such as "0x10" and " 1".
const STRICT_RE = new RegExp(`^[+-]?(?:${NUMBER_PATTERN})(?: ?(?:${STRICT_UNIT_PATTERN}))?$`)

/**
 * Check whether a string is a valid single time expression in strict form, without throwing.
 *
 * Acts as a TypeScript type guard — when it returns `true`, the input is narrowed to
 * `TimeExpression`. This is the exact runtime check for the strict form. It rejects compound
 * expressions, extra whitespace, and mixed casing such as `"1mS"`, even though `parse` accepts some
 * of these leniently.
 *
 * The guard accepts a strict subset of the `TimeExpression` type. Template literal types cannot
 * express the exact number grammar, so some strings such as `"0x10h"` or `" 1h"` satisfy the type
 * but the guard rejects them.
 *
 * @example
 *   isTimeExpression("1h") // true
 *   isTimeExpression("500ms") // true
 *   isTimeExpression("1h 30m") // false (compound)
 *   isTimeExpression("hello") // false
 *
 *   const input: string = getUserInput()
 *   if (isTimeExpression(input)) {
 *     ms(input) // TypeScript knows `input` is TimeExpression
 *   }
 *
 * @param value - The string to validate
 *
 * @returns `true` if the string is a valid single time expression in strict form
 */
export function isTimeExpression(value: string): value is TimeExpression {
  return typeof value === "string" && STRICT_RE.test(value) && safeParse(value) !== null
}

/**
 * Check whether a string parses as a time expression (simple or compound), without throwing.
 *
 * This accepts everything `parse` accepts, including compound expressions (`"1h 30m"`) and lenient
 * forms (`"1 HOUR"`). Use `safeParse` instead when you also need the parsed value.
 *
 * @example
 *   isValidTimeExpression("1h") // true
 *   isValidTimeExpression("1h 30m") // true
 *   isValidTimeExpression("hello") // false
 *   isValidTimeExpression("") // false
 *
 * @param value - The string to validate
 *
 * @returns `true` if `parse` accepts the string
 */
export function isValidTimeExpression(value: string): boolean {
  return safeParse(value) !== null
}
