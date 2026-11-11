import type { WordList } from "#lib/lists/index.ts"
import { InvalidOptionError, NotEnoughWordsError } from "./errors"
import { groupWords, hasEnoughWords, shortestFill } from "./groups"
import { type GenerateOptions, resolveSettings } from "./options"

function randomIndex(random: () => unknown, length: number) {
  const value = random()

  if (typeof value !== "number" || !(value >= 0 && value < 1)) {
    throw new InvalidOptionError("random", value, "a function that returns a number from 0 up to 1")
  }

  return Math.floor(value * length)
}

// Returns a function that removes and returns a random word of the pool each time it is called,
// or undefined when none are left.
function drawFrom(pool: WordList, random: () => unknown) {
  const candidates = [...pool]

  return () => {
    if (candidates.length === 0) return

    const at = randomIndex(random, candidates.length)
    const last = candidates.pop()
    if (at === candidates.length) return last

    const taken = candidates[at]
    if (last !== undefined) candidates[at] = last

    return taken
  }
}

/**
 * Checks whether the positions from `start` onward can take distinct words that are not in `used`,
 * within `budget` letters.
 */
type Fits = (start: number, used: ReadonlySet<string>, budget: number) => boolean

function fitter(pools: readonly WordList[], maxLength: number | undefined): Fits {
  // Positions are filled in order, so the earlier positions use at most `index` words. With no
  // length limit, a pool with more words than that always has an unused word left, so any choice
  // keeps the rest of the name possible and no search is needed.
  if (maxLength === undefined && pools.every((pool, index) => pool.length > index)) {
    return () => true
  }

  const groups = groupWords(pools)
  return (start, used, budget) => {
    // shortestFill returns Infinity when no distinct words fill the rest. That never fits, even
    // when there is no length limit and the budget is Infinity too.
    const length = shortestFill(groups, start, pools.length, used)
    return Number.isFinite(length) && length <= budget
  }
}

/**
 * Generate a random name, such as `"amber-fox"`.
 *
 * By default, the name has two words. The first word is an adjective or a color, and the later
 * words are nouns from the other built-in lists. Use `pattern` to choose the list for each word,
 * and `lists` to add custom lists that the pattern can name.
 *
 * A name never repeats a word. Each word is chosen uniformly from the words of its list that are
 * unused and still let the rest of the name fit within `maxLength`.
 *
 * @example
 *   generate() // "amber-fox"
 *   generate({ segments: 3, separator: "_" }) // "teal_heron_cathedral"
 *   generate({ pattern: ["color", "animal"] }) // "teal-otter"
 *   generate({ lists: { fruit: ["apple", "pear"] }, pattern: ["fruit", "animal"] }) // "pear-otter"
 *
 * @param options - How to build the name
 *
 * @returns The words of the name, joined by the separator
 * @throws {InvalidOptionError} If an option is invalid
 * @throws {NotEnoughWordsError} If no name satisfies the options
 */
export function generate<const N extends string = never>(options: GenerateOptions<N> = {}): string {
  const { maxLength, pools, random, separator } = resolveSettings(options)
  if (!hasEnoughWords(pools)) throw new NotEnoughWordsError("unique")

  const fits = fitter(pools, maxLength)
  const used = new Set<string>()
  let budget =
    maxLength === undefined
      ? Number.POSITIVE_INFINITY
      : maxLength - separator.length * (pools.length - 1)

  if (!fits(0, used, budget)) {
    throw new NotEnoughWordsError(fits(0, used, Number.POSITIVE_INFINITY) ? "maxLength" : "unique")
  }

  const words: string[] = []
  const fitsAt = (index: number, word: string) => {
    if (used.has(word) || word.length > budget) return false

    used.add(word)
    const result = fits(index + 1, used, budget - word.length)
    used.delete(word)

    return result
  }

  for (const [index, pool] of pools.entries()) {
    // Draw without replacement until a word fits. The first check passed, so one always does.
    const draw = drawFrom(pool, random)
    let word = draw()

    while (word !== undefined && !fitsAt(index, word)) {
      word = draw()
    }

    if (word === undefined) throw new NotEnoughWordsError("unique")

    used.add(word)
    words.push(word)
    budget -= word.length
  }

  return words.join(separator)
}
