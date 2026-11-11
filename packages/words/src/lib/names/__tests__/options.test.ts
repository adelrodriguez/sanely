import { describe, expect, it } from "vitest"
import { lists } from "#lib/lists/index.ts"
import { InvalidOptionError } from "#lib/names/errors.ts"
import { resolveSettings } from "#lib/names/options.ts"

// Callers without types can pass any value, so the parser has to reject it.
function invalidOption(options: Record<string, unknown>) {
  try {
    resolveSettings(options)
  } catch (error) {
    if (error instanceof InvalidOptionError) return error.option
    throw error
  }

  throw new Error("Expected resolveSettings to throw")
}

describe("resolveSettings", () => {
  it("defaults to two words, a hyphen, and Math.random", () => {
    const settings = resolveSettings({})

    expect(settings.pools).toHaveLength(2)
    expect(settings.separator).toBe("-")
    expect(settings.random).toBe(Math.random)
    expect(settings.maxLength).toBeUndefined()
  })

  it("resolves pattern names to built-in and custom lists", () => {
    const { pools } = resolveSettings({
      lists: { fruit: ["pear", "pear"] },
      pattern: ["animal", "fruit"],
    })

    expect(pools).toEqual([lists.animal, ["pear"]])
  })

  it.each([
    [{ segments: 1 }, "segments"],
    [{ segments: 2.5 }, "segments"],
    [{ pattern: ["animal"] }, "pattern.length"],
    [{ pattern: "animal" }, "pattern"],
    [{ pattern: ["animal", "colour"] }, "pattern[1]"],
    [{ pattern: ["animal", "toString"] }, "pattern[1]"],
    [{ pattern: ["animal", "color"], segments: 2 }, "segments"],
    [{ lists: { fruit: ["pear"] } }, "lists"],
    [{ lists: { animal: ["cat"] }, pattern: ["animal", "color"] }, "lists"],
    [{ lists: { "": ["cat"] }, pattern: ["animal", "color"] }, "lists"],
    [{ lists: { fruit: "pear" }, pattern: ["fruit", "color"] }, "lists.fruit"],
    [{ lists: { fruit: ["pear", ""] }, pattern: ["fruit", "color"] }, "lists.fruit[1]"],
    [{ omit: "fox" }, "omit"],
    [{ separator: "" }, "separator"],
    [{ maxLength: 0 }, "maxLength"],
    [{ maxLength: 1.5 }, "maxLength"],
    [{ random: 0.5 }, "random"],
  ])("rejects %o by naming %s", (options, option) => {
    expect(invalidOption(options)).toBe(option)
  })
})
