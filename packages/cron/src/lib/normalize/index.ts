import { UNITS } from "@sanely/core/time"
import { DAY_GROUPS, DAYS } from "#lib/vocabulary/words.ts"

const INTERVAL_UNITS = UNITS.filter((unit) => unit.long === "minute" || unit.long === "hour")

const DAY_BY_ALIAS: ReadonlyMap<string, string> = new Map(
  Object.entries(DAYS).flatMap(([name, day]) => day.aliases.map((alias) => [alias, name] as const))
)

const UNIT_BY_ALIAS: ReadonlyMap<string, (typeof INTERVAL_UNITS)[number]> = new Map(
  INTERVAL_UNITS.flatMap((unit) => unit.aliases.map((alias) => [alias, unit] as const))
)

const GROUP_BY_WORD: ReadonlyMap<string, { readonly plural: string; readonly singular: string }> =
  new Map(
    Object.entries(DAY_GROUPS).flatMap(([plural, { singular }]) => {
      const group = { plural, singular }
      return [[singular, group] as const, [plural, group] as const]
    })
  )

// A number with a unit alias and no space, such as "15m".
const ATTACHED_UNIT_RE = /^(\d+)([a-z]+)$/

function splitAttachedUnit(token: string): string[] {
  const match = ATTACHED_UNIT_RE.exec(token)
  if (match?.[1] && match[2] && UNIT_BY_ALIAS.has(match[2])) return [match[1], match[2]]
  return [token]
}

// Map one alias to its canonical word. The singular and plural forms of a unit or a day group are
// spelling variants: the word before them selects the form that the strict form uses.
function mapWord(word: string, previous: string | undefined): string {
  const unit = UNIT_BY_ALIAS.get(word)
  if (unit) return previous === "every" ? unit.long : unit.longPlural

  const group = GROUP_BY_WORD.get(word)
  if (group && previous === "every") return group.singular
  if (group && previous === "on") return group.plural

  return DAY_BY_ALIAS.get(word) ?? word
}

/**
 * Change a cron phrase in the lenient form to the strict form. The result is a spelling change
 * only: normalization never adds a word that is not in the input, and never changes the order of
 * the words. The grammar rejects the result if it is not a strict cron phrase.
 */
export function normalize(phrase: string): string {
  const text = phrase
    .toLowerCase()
    .replaceAll(/\s+/g, " ")
    .trim()
    .replaceAll(/ ?, ?/g, ", ")
    .replaceAll(", and ", " and ")
    .replaceAll(/(\d) (am|pm)(?= |,|$)/g, "$1$2")

  const tokens = text.split(" ").flatMap((token) => splitAttachedUnit(token))

  return tokens
    .map((token, index) => {
      const hasComma = token.endsWith(",")
      const word = hasComma ? token.slice(0, -1) : token
      const previous = tokens[index - 1]
      return `${mapWord(word, previous)}${hasComma ? "," : ""}`
    })
    .join(" ")
}
