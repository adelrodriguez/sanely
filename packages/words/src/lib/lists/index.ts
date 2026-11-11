import { adjective } from "./adjective"
import { animal } from "./animal"
import { architecture } from "./architecture"
import { art } from "./art"
import { city } from "./city"
import { color } from "./color"
import { emotion } from "./emotion"
import { fantasy } from "./fantasy"
import { fashion } from "./fashion"
import { food } from "./food"
import { history } from "./history"
import { literature } from "./literature"
import { music } from "./music"
import { nature } from "./nature"
import { profession } from "./profession"
import { science } from "./science"
import { space } from "./space"
import { sport } from "./sport"
import { transportation } from "./transportation"

/**
 * A list of words that a name can draw from.
 */
export type WordList = readonly string[]

/**
 * The built-in word lists, keyed by category.
 *
 * Every word is lowercase ASCII letters with no spaces, and no word repeats within a list.
 *
 * @example
 *   import { lists } from "@sanely/words"
 *
 *   lists.animal.length // 203
 */
export const lists = Object.freeze({
  adjective,
  animal,
  architecture,
  art,
  city,
  color,
  emotion,
  fantasy,
  fashion,
  food,
  history,
  literature,
  music,
  nature,
  profession,
  science,
  space,
  sport,
  transportation,
})

/**
 * The name of a built-in word list.
 */
export type Category = keyof typeof lists

/**
 * Check whether a value names a built-in word list, without throwing.
 *
 * Use it to parse a pattern that comes from outside the code, such as a config file.
 *
 * @example
 *   const pattern = JSON.parse(input)
 *
 *   if (Array.isArray(pattern) && pattern.every(isCategory)) {
 *     generate({ pattern })
 *   }
 *
 * @param value - The value to check
 *
 * @returns `true` if the value is the name of a built-in word list
 */
export function isCategory(value: unknown): value is Category {
  return typeof value === "string" && Object.hasOwn(lists, value)
}

// A default name starts with a prefix and continues with nouns.
const prefixCategories = new Set<Category>(["adjective", "color"])

function categoriesWhere(predicate: (category: Category) => boolean): Category[] {
  return Object.keys(lists)
    .filter((key) => isCategory(key))
    .filter((category) => predicate(category))
}

/**
 * The categories that a default name draws its first word from.
 */
export const prefixes = categoriesWhere((category) => prefixCategories.has(category))

/**
 * The categories that a default name draws its later words from.
 */
export const nouns = categoriesWhere((category) => !prefixCategories.has(category))
