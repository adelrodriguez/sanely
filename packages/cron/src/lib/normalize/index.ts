import { findUnit, getAmbiguousUnitHint, type UnitDefinition } from "@sanely/core/time"
import { DAY_GROUPS, DAYS } from "#lib/vocabulary/words.ts"

const DAY_BY_ALIAS: ReadonlyMap<string, string> = new Map(
  Object.entries(DAYS).flatMap(([name, day]) => day.aliases.map((alias) => [alias, name] as const))
)

const GROUP_BY_WORD: ReadonlyMap<string, { readonly plural: string; readonly singular: string }> =
  new Map(
    Object.entries(DAY_GROUPS).flatMap(([plural, { singular }]) => {
      const group = { plural, singular }
      return [[singular, group] as const, [plural, group] as const]
    })
  )

// A number with a unit alias and no space, such as "15m".
const ATTACHED_UNIT_RE = /^(\d+)([a-z]+)$/i

// Find a minute or hour alias in any case. `findUnit` rejects an ambiguous token, such as "M".
function findIntervalUnit(token: string): UnitDefinition | undefined {
  const unit = findUnit(token)
  return unit?.long === "minute" || unit?.long === "hour" ? unit : undefined
}

// An ambiguous unit, alone or after its number, stays as written so the grammar can reject it.
// Lowercasing "15M" would make it "15m", which a second pass would read as minutes.
function hasAmbiguousUnit(token: string): boolean {
  return getAmbiguousUnitHint(ATTACHED_UNIT_RE.exec(token)?.[2] ?? token) !== undefined
}

function splitAttachedUnit(token: string): string[] {
  const match = ATTACHED_UNIT_RE.exec(token)
  if (match?.[1] && match[2] && findIntervalUnit(match[2])) return [match[1], match[2]]
  return [token]
}

// Map one alias to its canonical word. The singular and plural forms of a unit or a day group are
// spelling variants: the word before them selects the form that the strict form uses.
function mapWord(word: string, previous: string | undefined): string {
  if (hasAmbiguousUnit(word)) return word

  const unit = findIntervalUnit(word)
  if (unit) return previous === "every" ? unit.long : unit.longPlural

  const lower = word.toLowerCase()
  const group = GROUP_BY_WORD.get(lower)
  if (group && previous === "every") return group.singular
  if (group && previous === "on") return group.plural

  return DAY_BY_ALIAS.get(lower) ?? lower
}

/**
 * Change a cron phrase in the lenient form to the strict form. The result is a spelling change
 * only: normalization never adds a word that is not in the input, and never changes the order of
 * the words. The grammar rejects the result if it is not a strict cron phrase.
 */
export function normalize(phrase: string): string {
  // Each word is lowercased in `mapWord`, so that an ambiguous unit keeps its case.
  const text = phrase
    .replaceAll(/\s+/g, " ")
    .trim()
    .replaceAll(/ ?, ?/g, ", ")
    .replaceAll(/, and /gi, " and ")
    .replaceAll(/(\d) (am|pm)(?= |,|$)/gi, "$1$2")

  const tokens = text.split(" ").flatMap((token) => splitAttachedUnit(token))

  return tokens
    .map((token, index) => {
      const hasComma = token.endsWith(",")
      const word = hasComma ? token.slice(0, -1) : token
      const previous = tokens[index - 1]?.toLowerCase()
      return `${mapWord(word, previous)}${hasComma ? "," : ""}`
    })
    .join(" ")
}
