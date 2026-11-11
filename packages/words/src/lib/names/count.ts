import { groupWords } from "./groups"
import { type CountOptions, resolvePools } from "./options"

/**
 * Count the distinct names that `generate` can return with the same options.
 *
 * The count ignores `maxLength`, `separator`, and `random`. A count above `Number.MAX_SAFE_INTEGER`
 * is approximate.
 *
 * @example
 *   count() // 674_245
 *   count({ pattern: ["color", "animal"] }) // 26_190
 *
 * @param options - The lists to draw from, as for `generate`
 *
 * @returns The number of distinct names
 * @throws {InvalidOptionError} If an option is invalid
 */
export function count<const N extends string = never>(options: CountOptions<N> = {}): number {
  const pools = resolvePools(options)
  const groups = groupWords(pools)
  const memo = new Map<string, number>()
  // How many words of each group the earlier positions used.
  const used = groups.map(() => 0)

  // Counts the ways to fill the positions from `index` onward.
  const from = (index: number): number => {
    if (index === pools.length) return 1

    const key = used.join(",")
    const cached = memo.get(key)
    if (cached !== undefined) return cached

    let total = 0

    for (const [at, group] of groups.entries()) {
      const taken = used[at] ?? 0
      const size = group.words.length
      if (!group.positions.has(index) || taken === size) continue

      used[at] = taken + 1
      total += (size - taken) * from(index + 1)
      used[at] = taken
    }

    memo.set(key, total)
    return total
  }

  return from(0)
}
