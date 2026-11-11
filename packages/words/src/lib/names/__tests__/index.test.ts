import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { lists } from "#lib/lists/index.ts"
import { InvalidOptionError, NotEnoughWordsError } from "#lib/names/errors.ts"
import { generate } from "#lib/names/index.ts"
import { allNames, seeded } from "./brute-force"

const prefixWords = new Set([...lists.adjective, ...lists.color])
const nounWords = new Set(
  Object.entries(lists)
    .filter(([category]) => category !== "adjective" && category !== "color")
    .flatMap(([, words]) => words)
)

describe("generate", () => {
  it("starts a default name with a prefix and continues with a noun", () => {
    for (let run = 0; run < 200; run += 1) {
      const [prefix, noun, ...rest] = generate().split("-")

      expect(prefixWords.has(prefix ?? "")).toBe(true)
      expect(nounWords.has(noun ?? "")).toBe(true)
      expect(rest).toEqual([])
    }
  })

  it("uses segments as the number of words and separator between them", () => {
    const words = generate({ segments: 4, separator: "_" }).split("_")

    expect(words).toHaveLength(4)
    expect(words.slice(1).every((word) => nounWords.has(word))).toBe(true)
  })

  it("draws each word from its list in the pattern", () => {
    for (let run = 0; run < 100; run += 1) {
      const [color, animal] = generate({ pattern: ["color", "animal"] }).split("-")

      expect(lists.color).toContain(color)
      expect(lists.animal).toContain(animal)
    }
  })

  it("draws from custom lists and never returns an omitted word", () => {
    const names = new Set(
      Array.from({ length: 100 }, () =>
        generate({
          lists: { fruit: ["apple", "pear"], texture: ["linen", "silk"] },
          omit: ["pear", "silk"],
          pattern: ["fruit", "texture"],
        })
      )
    )

    expect([...names]).toEqual(["apple-linen"])
  })

  it("never repeats a word", () => {
    for (let run = 0; run < 100; run += 1) {
      const words = generate({ lists: { pair: ["ox", "owl"] }, pattern: ["pair", "pair"] }).split(
        "-"
      )

      expect(new Set(words).size).toBe(2)
    }
  })

  it("repeats a name for the same seed", () => {
    expect(generate({ random: seeded(7), segments: 3 })).toBe(
      generate({ random: seeded(7), segments: 3 })
    )
  })

  it("reaches every possible name of small lists", () => {
    const pools = { first: ["a", "b", "c"], second: ["b", "c", "d"] }
    const expected = allNames([pools.first, pools.second]).map((words) => words.join("-"))
    const random = seeded(1)
    const names = new Set(
      Array.from({ length: 500 }, () =>
        generate({ lists: pools, pattern: ["first", "second"], random })
      )
    )

    expect([...names].toSorted()).toEqual(expected.toSorted())
  })

  describe("with maxLength", () => {
    it("fits every name within maxLength", () => {
      for (const maxLength of [7, 8, 12, 20]) {
        for (let run = 0; run < 100; run += 1) {
          expect(generate({ maxLength, segments: 2 }).length).toBeLessThanOrEqual(maxLength)
        }
      }
    })

    it("throws NotEnoughWordsError when no name fits", () => {
      expect(() => generate({ maxLength: 4 })).toThrow(new NotEnoughWordsError("maxLength"))
    })

    it("returns a name exactly when one fits, for small lists", () => {
      const pool = fc.uniqueArray(fc.stringMatching(/^[a-d]{1,4}$/u), { maxLength: 4 })

      fc.assert(
        fc.property(
          fc.tuple(pool, pool, pool),
          fc.integer({ max: 16, min: 1 }),
          (words, maxLength) => {
            const [a, b, c] = words
            const options = { lists: { a, b, c }, maxLength, pattern: ["a", "b", "c"] } as const
            const fitting = allNames([a, b, c])
              .map((name) => name.join("-"))
              .filter((name) => name.length <= maxLength)

            if (fitting.length === 0) {
              expect(() => generate(options)).toThrow(NotEnoughWordsError)
            } else {
              expect(fitting).toContain(generate(options))
            }
          }
        )
      )
    })

    it.each([8, 16])("decides the tightest limit for %i words quickly", (segments) => {
      // The shortest name: the shortest prefix, the shortest nouns, and the separators.
      const shortest =
        Math.min(...[...prefixWords].map((word) => word.length))
        + [...nounWords]
          .map((word) => word.length)
          .toSorted((a, b) => a - b)
          .slice(0, segments - 1)
          .reduce((total, length) => total + length, segments - 1)
      const start = performance.now()

      expect(() => generate({ maxLength: shortest - 1, segments })).toThrow(NotEnoughWordsError)
      expect(generate({ maxLength: shortest, segments })).toHaveLength(shortest)
      expect(performance.now() - start).toBeLessThan(500)
    })
  })

  it("rejects more than 16 words before searching", () => {
    expect(() => generate({ segments: 17 })).toThrow(InvalidOptionError)
    expect(() => generate({ segments: 5000 })).toThrow(InvalidOptionError)
  })

  it("throws NotEnoughWordsError when the lists hold too few distinct words", () => {
    expect(() => generate({ lists: { fruit: ["apple"] }, pattern: ["fruit", "fruit"] })).toThrow(
      new NotEnoughWordsError("unique")
    )
  })

  it("rejects a random source that returns a number outside 0 up to 1", () => {
    expect(() => generate({ random: () => 1 })).toThrow(InvalidOptionError)
    expect(() => generate({ random: () => Number.NaN })).toThrow(InvalidOptionError)
  })
})
