import {
  type Category,
  isCategory,
  lists,
  nouns,
  prefixes,
  type WordList,
} from "#lib/lists/index.ts"
import { InvalidOptionError } from "./errors"

// A custom list adds a category. It can never replace a built-in one.
type CustomLists<N extends string> = { [K in N]: K extends Category ? never : WordList }

type Shape<N extends string> =
  | {
      /**
       * The number of words. The first word is an adjective or a color, and the rest are nouns from
       * the other built-in lists. At least 2. Defaults to 2.
       */
      segments?: number
      pattern?: never
      lists?: never
    }
  | {
      /**
       * The list for each word, in order: a built-in category or the name of a custom list. Its
       * length sets the number of words. At least 2.
       */
      pattern: ReadonlyArray<NoInfer<Category | N>>
      /**
       * Custom word lists that `pattern` can name. A name must not reuse a built-in category.
       */
      lists?: CustomLists<N>
      segments?: never
    }

/**
 * Options for `count`. `N` is the names of the custom lists.
 */
export type CountOptions<N extends string = never> = Shape<N> & {
  /**
   * Words to exclude from every list, built-in and custom.
   */
  omit?: WordList
}

/**
 * Options for `generate`. `N` is the names of the custom lists.
 */
export type GenerateOptions<N extends string = never> = CountOptions<N> & {
  /**
   * The text between words. Must not be empty. Defaults to `"-"`.
   */
  separator?: string
  /**
   * The longest name allowed, separators included. A positive integer.
   */
  maxLength?: number
  /**
   * The source of randomness. Must return a number from 0 up to, but not including, 1. Defaults to
   * `Math.random`.
   */
  random?: () => number
}

/**
 * Generation settings parsed from the options.
 */
export interface Settings {
  /**
   * The distinct words available for each position of the name.
   */
  pools: readonly WordList[]
  separator: string
  maxLength: number | undefined
  random: () => unknown
}

const MIN_WORDS = 2

// Built-in lists hold distinct words, but a word can appear in more than one list.
const defaultPools = {
  noun: [...new Set(nouns.flatMap((category) => lists[category]))],
  prefix: [...new Set(prefixes.flatMap((category) => lists[category]))],
}

// Returns the distinct words of a list that the caller passed.
function wordList(option: string, value: unknown): WordList {
  if (!Array.isArray(value)) {
    throw new InvalidOptionError(option, value, "an array of words")
  }

  const words = new Set<string>()

  for (const [index, word] of value.entries()) {
    if (typeof word !== "string" || word === "") {
      throw new InvalidOptionError(`${option}[${index}]`, word, "a non-empty string")
    }

    words.add(word)
  }

  return [...words]
}

function wordCount(option: string, value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < MIN_WORDS) {
    throw new InvalidOptionError(option, value, `an integer of at least ${MIN_WORDS}`)
  }

  return value
}

function customLists(value: unknown): Map<string, WordList> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidOptionError("lists", value, "an object of word lists")
  }

  const custom = new Map<string, WordList>()

  for (const [name, words] of Object.entries(value)) {
    if (name === "" || isCategory(name)) {
      throw new InvalidOptionError("lists", name, "a name that is not empty or a built-in category")
    }

    custom.set(name, wordList(`lists.${name}`, words))
  }

  return custom
}

function patternPools(pattern: unknown, custom: ReadonlyMap<string, WordList>): WordList[] {
  if (!Array.isArray(pattern)) {
    throw new InvalidOptionError("pattern", pattern, "an array of list names")
  }

  wordCount("pattern.length", pattern.length)

  return pattern.map((name: unknown, index) => {
    if (typeof name === "string") {
      const words = custom.get(name) ?? (isCategory(name) ? lists[name] : undefined)
      if (words) return words
    }

    throw new InvalidOptionError(`pattern[${index}]`, name, "a built-in category or a custom list")
  })
}

// Default pools keep one identity per word count, so their word groups are built once.
const segmentPoolsByCount = new Map<number, WordList[]>()

function segmentPools(segments: unknown): WordList[] {
  const count = wordCount("segments", segments)
  const cached = segmentPoolsByCount.get(count)
  if (cached) return cached

  const pools = [defaultPools.prefix, ...Array.from({ length: count - 1 }, () => defaultPools.noun)]
  segmentPoolsByCount.set(count, pools)
  return pools
}

/**
 * Parse the options that choose words into the distinct words for each position of the name.
 *
 * @throws {InvalidOptionError} If an option is invalid
 */
export function resolvePools(options: CountOptions<string>): readonly WordList[] {
  // Callers without types can pass any value, so each option is parsed from unknown.
  const { lists: custom, omit = [], pattern, segments }: Record<string, unknown> = options

  if (pattern !== undefined && segments !== undefined) {
    throw new InvalidOptionError("segments", segments, "unset when pattern is set")
  }

  if (pattern === undefined && custom !== undefined) {
    throw new InvalidOptionError("lists", custom, "unset when pattern is unset")
  }

  const pools =
    pattern === undefined
      ? segmentPools(segments ?? MIN_WORDS)
      : patternPools(pattern, custom === undefined ? new Map() : customLists(custom))
  const omitted = new Set(wordList("omit", omit))

  if (omitted.size === 0) return pools

  return pools.map((pool) => pool.filter((word) => !omitted.has(word)))
}

// The caller's function is checked again on each call, by the number it returns.
function isRandom(value: unknown): value is () => unknown {
  return typeof value === "function"
}

/**
 * Parse the options for `generate`.
 *
 * @throws {InvalidOptionError} If an option is invalid
 */
export function resolveSettings(options: GenerateOptions<string>): Settings {
  const { maxLength, random = Math.random, separator = "-" }: Record<string, unknown> = options

  if (typeof separator !== "string" || separator === "") {
    throw new InvalidOptionError("separator", separator, "a non-empty string")
  }

  if (
    maxLength !== undefined
    && (typeof maxLength !== "number" || !Number.isSafeInteger(maxLength) || maxLength <= 0)
  ) {
    throw new InvalidOptionError("maxLength", maxLength, "a positive integer")
  }

  if (!isRandom(random)) {
    throw new InvalidOptionError("random", random, "a function")
  }

  return { maxLength, pools: resolvePools(options), random, separator }
}
