import type { WordList } from "#lib/lists/index.ts"

/**
 * Every name of distinct words, one from each pool, by direct enumeration. Use it only on small
 * pools.
 */
export function allNames(pools: readonly WordList[]): string[][] {
  const extend = (index: number, words: string[]): string[][] => {
    const pool = pools[index]
    if (pool === undefined) return [words]

    return [...new Set(pool)]
      .filter((word) => !words.includes(word))
      .flatMap((word) => extend(index + 1, [...words, word]))
  }

  return extend(0, [])
}

/**
 * A seeded source of numbers from 0 up to 1 (mulberry32), so a test can repeat a draw.
 */
export function seeded(seed: number): () => number {
  let state = seed

  return () => {
    state = (state + 1_831_565_813) >>> 0
    let value = Math.imul(state ^ (state >>> 15), state | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}
