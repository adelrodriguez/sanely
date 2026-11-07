import { UNIT_ALIASES } from "@sanely/core/time"

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

// Longer alternatives must come before shorter ones to prevent partial matches
// (e.g. "months" before "mo", "minutes" before "m").
function toAlternation(aliases: readonly string[]): string {
  return aliases
    .toSorted((a, b) => b.length - a.length)
    .map((alias) => escapeRegExp(alias))
    .join("|")
}

/**
 * Unsigned numeric token shared by the strict and lenient grammars.
 */
export const NUMBER_PATTERN = "\\d*\\.?\\d+(?:[eE][+-]?\\d+)?"

/**
 * Case-insensitive alias alternation for the lenient parse grammar. Combine with the `i` flag.
 */
export const LENIENT_UNIT_PATTERN = toAlternation(UNIT_ALIASES)

/**
 * Exact-casing alias alternation for the strict grammar. Accepts only the casings that the
 * `TimeExpression` type accepts for units: lowercase, Capitalized, and UPPERCASE.
 */
export const STRICT_UNIT_PATTERN = toAlternation([
  ...new Set(UNIT_ALIASES.flatMap((alias) => [alias, alias.toUpperCase(), capitalize(alias)])),
])
