import { describe, expect, it } from "vitest"
import { isCategory, lists, nouns, prefixes } from "#lib/lists/index.ts"

describe("lists", () => {
  it.each(Object.entries(lists))("holds distinct lowercase words in %s", (_, words) => {
    expect(words.length).toBeGreaterThan(0)
    expect(new Set(words).size).toBe(words.length)

    for (const word of words) {
      expect(word).toMatch(/^[a-z]+$/u)
    }
  })

  it("cannot be changed, including each list", () => {
    expect(Object.isFrozen(lists)).toBe(true)

    for (const words of Object.values(lists)) {
      expect(Object.isFrozen(words)).toBe(true)
    }
  })
})

describe("isCategory", () => {
  it("accepts the name of every built-in list", () => {
    expect(Object.keys(lists).every((key) => isCategory(key))).toBe(true)
  })

  it("rejects other values, including inherited keys", () => {
    for (const value of ["colour", "", "toString", "__proto__", 1, null, undefined]) {
      expect(isCategory(value)).toBe(false)
    }
  })
})

describe("prefixes and nouns", () => {
  it("split the built-in categories between them", () => {
    expect(prefixes).toEqual(["adjective", "color"])
    expect([...prefixes, ...nouns].toSorted()).toEqual(Object.keys(lists).toSorted())
  })
})
