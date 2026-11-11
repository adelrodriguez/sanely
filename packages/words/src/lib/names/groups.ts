import type { WordList } from "#lib/lists/index.ts"

/**
 * Words that belong to exactly the same positions of a name, sorted from shortest to longest. Two
 * words in one group can swap places without changing which names are possible.
 */
export interface Group {
  positions: ReadonlySet<number>
  words: readonly string[]
}

// Pools that keep their identity across calls, such as the default pools, are grouped once.
const cache = new WeakMap<readonly WordList[], readonly Group[]>()

/**
 * Check whether the pools hold at least one distinct word for each position. When they do not, no
 * name exists, and the check avoids a search that grows with the number of positions.
 */
export function hasEnoughWords(pools: readonly WordList[]): boolean {
  return new Set([...new Set(pools)].flat()).size >= pools.length
}

/**
 * Split the words of a name's positions into groups that share the same positions.
 *
 * A name has few positions, so a few groups cover thousands of words. Counting and fitting names
 * then work on the groups instead of on each word.
 */
export function groupWords(pools: readonly WordList[]): readonly Group[] {
  const cached = cache.get(pools)
  if (cached) return cached

  const positions = new Map<string, number[]>()

  for (const [index, pool] of pools.entries()) {
    for (const word of pool) {
      const indexes = positions.get(word)

      if (indexes) indexes.push(index)
      else positions.set(word, [index])
    }
  }

  const groups = new Map<string, { positions: Set<number>; words: string[] }>()

  for (const [word, indexes] of positions) {
    const key = indexes.join(",")
    const group = groups.get(key)

    if (group) group.words.push(word)
    else groups.set(key, { positions: new Set(indexes), words: [word] })
  }

  const result = [...groups.values()].map((group) => ({
    positions: group.positions,
    words: group.words.toSorted((a, b) => a.length - b.length),
  }))

  cache.set(pools, result)
  return result
}

/**
 * Find the shortest total length of distinct words that can fill the positions from `start` to
 * `end`, skipping the words in `used`.
 *
 * Within a group, the shortest unused words are always the best choice, so the search only decides
 * how many words each group gives. It returns `Infinity` when the positions cannot be filled with
 * distinct words.
 */
export function shortestFill(
  groups: readonly Group[],
  start: number,
  end: number,
  used: ReadonlySet<string>
): number {
  const taken = groups.map(() => 0)
  const memo = new Map<string, number>()

  // At most `used.size` words come before the next unused word, so a short slice is enough.
  const nextLength = (group: Group, skip: number) =>
    group.words.slice(0, skip + used.size + 1).filter((word) => !used.has(word))[skip]?.length

  const fill = (index: number): number => {
    if (index === end) return 0

    const key = taken.join(",")
    const cached = memo.get(key)
    if (cached !== undefined) return cached

    let best = Number.POSITIVE_INFINITY

    for (const [at, group] of groups.entries()) {
      const count = taken[at] ?? 0
      const length = group.positions.has(index) ? nextLength(group, count) : undefined
      if (length === undefined) continue

      taken[at] = count + 1
      best = Math.min(best, length + fill(index + 1))
      taken[at] = count
    }

    memo.set(key, best)
    return best
  }

  return fill(start)
}
