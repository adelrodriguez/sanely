import { describe, expect, it } from "vitest"
import * as words from "#index.ts"

describe("@sanely/words", () => {
  it("exports the public runtime values", () => {
    expect(Object.keys(words).toSorted()).toEqual([
      "InvalidOptionError",
      "NotEnoughWordsError",
      "count",
      "generate",
      "isCategory",
      "lists",
    ])
  })

  it("generates a name that count includes", () => {
    const options = { lists: { fruit: ["apple"] }, pattern: ["fruit", "color"] } as const

    expect(words.generate(options)).toMatch(/^apple-[a-z]+$/u)
    expect(words.count(options)).toBe(words.lists.color.length)
  })
})
