import { groupWords, hasEnoughWords } from "./groups"
import { type CountOptions, resolvePools } from "./options"

/**
 * Count the distinct names that `generate` can return with the same options.
 *
 * The count ignores `maxLength`, `separator`, and `random`. It is a `bigint`, so it stays exact for
 * any number of words.
 *
 * @example
 *   count() // 1_084_149n
 *   count({ pattern: ["color", "animal"] }) // 34_830n
 *
 * @param options - The lists to draw from, as for `generate`
 *
 * @returns The exact number of distinct names
 * @throws {InvalidOptionError} If an option is invalid
 */
export function count<const N extends string = never>(options: CountOptions<N> = {}): bigint {
  const pools = resolvePools(options)
  if (!hasEnoughWords(pools)) return 0n

  const groups = groupWords(pools)
  const memo = new Map<string, bigint>()
  // How many words of each group the earlier positions used.
  const used = groups.map(() => 0)

  // Counts the ways to fill the positions from `index` onward.
  const from = (index: number): bigint => {
    if (index === pools.length) return 1n

    const key = used.join(",")
    const cached = memo.get(key)
    if (cached !== undefined) return cached

    let total = 0n

    for (const [at, group] of groups.entries()) {
      const taken = used[at] ?? 0
      const size = group.words.length
      if (!group.positions.has(index) || taken === size) continue

      used[at] = taken + 1
      total += BigInt(size - taken) * from(index + 1)
      used[at] = taken
    }

    memo.set(key, total)
    return total
  }

  return from(0)
}
