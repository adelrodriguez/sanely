import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { lists } from "#lib/lists/index.ts"
import { count } from "#lib/names/count.ts"
import { InvalidOptionError } from "#lib/names/errors.ts"
import { allNames } from "./brute-force"

// A default name is a prefix followed by distinct nouns, and a prefix can also be a noun.
function defaultCount(segments: number) {
  const prefixes = new Set([...lists.adjective, ...lists.color])
  const nouns = new Set(
    Object.entries(lists)
      .filter(([category]) => category !== "adjective" && category !== "color")
      .flatMap(([, words]) => words)
  )

  return [...prefixes].reduce(
    (total, prefix) =>
      total + fallingFactorial(nouns.size - (nouns.has(prefix) ? 1 : 0), segments - 1),
    0
  )
}

function fallingFactorial(size: number, length: number) {
  return Array.from({ length }, (_, index) => size - index).reduce(
    (total, factor) => total * factor,
    1
  )
}

describe("count", () => {
  it.each([2, 3, 4])("counts %i-word default names", (segments) => {
    expect(count({ segments })).toBe(defaultCount(segments))
  })

  it("defaults to two words", () => {
    expect(count()).toBe(count({ segments: 2 }))
  })

  it("multiplies the sizes of disjoint lists", () => {
    expect(count({ pattern: ["color", "animal"] })).toBe(lists.color.length * lists.animal.length)
    expect(lists.color.filter((word) => lists.animal.includes(word))).toEqual([])
  })

  it("never repeats a word when a list appears twice", () => {
    const size = lists.adjective.length

    expect(count({ pattern: ["adjective", "adjective"] })).toBe(size * (size - 1))
  })

  it("counts custom lists and leaves out omitted words", () => {
    expect(
      count({
        lists: { fruit: ["apple", "pear"], texture: ["linen", "silk"] },
        omit: ["pear"],
        pattern: ["fruit", "texture"],
      })
    ).toBe(2)
  })

  it("returns 0 for more words than the lists hold", () => {
    expect(count({ segments: 5000 })).toBe(0)
  })

  it("returns 0 when the lists hold too few distinct words", () => {
    expect(count({ lists: { fruit: ["apple"] }, pattern: ["fruit", "fruit"] })).toBe(0)
  })

  it("matches enumeration for overlapping custom lists", () => {
    const names = ["a", "b", "c"] as const

    fc.assert(
      fc.property(
        fc.tuple(
          ...names.map(() =>
            fc.uniqueArray(fc.constantFrom("v", "w", "x", "y", "z"), { maxLength: 5 })
          )
        ),
        fc.array(fc.constantFrom(...names), { maxLength: 4, minLength: 2 }),
        (words, pattern) => {
          const custom = Object.fromEntries(names.map((name, index) => [name, words[index] ?? []]))
          const pools = pattern.map((name) => custom[name] ?? [])

          expect(count({ lists: custom, pattern })).toBe(allNames(pools).length)
        }
      )
    )
  })

  it("rejects invalid options", () => {
    expect(() => count({ segments: 1 })).toThrow(InvalidOptionError)
  })
})
