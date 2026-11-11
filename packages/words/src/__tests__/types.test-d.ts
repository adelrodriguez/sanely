import { describe, expectTypeOf, it } from "vitest"
import type { Category, InvalidOptionError, NotEnoughWordsReason } from "#index.ts"
import { count, generate, isCategory } from "#index.ts"

describe("generate", () => {
  it("returns a string", () => {
    expectTypeOf(generate()).toEqualTypeOf<string>()
  })

  it("accepts built-in categories and the names of custom lists", () => {
    generate({ pattern: ["color", "animal"] })
    generate({ lists: { fruit: ["apple", "pear"] }, pattern: ["fruit", "animal"] })
  })

  it("rejects names that no list defines", () => {
    // @ts-expect-error -- "colour" is not a category.
    generate({ pattern: ["colour", "animal"] })
    // @ts-expect-error -- the custom list is "fruit", not "fruits".
    generate({ lists: { fruit: ["apple"] }, pattern: ["fruits", "animal"] })
  })

  it("rejects a custom list that reuses a built-in category", () => {
    // @ts-expect-error -- "animal" is a built-in category.
    generate({ lists: { animal: ["cat"] }, pattern: ["animal", "color"] })
  })

  it("rejects segments with a pattern, and lists without one", () => {
    // @ts-expect-error -- pattern sets the number of words.
    generate({ pattern: ["color", "animal"], segments: 2 })
    // @ts-expect-error -- custom lists need a pattern that names them.
    generate({ lists: { fruit: ["apple"] } })
  })

  it("rejects a pattern widened to string[]", () => {
    const widened = ["color", "animal"]
    // @ts-expect-error -- widened patterns need `as const` or a Category[] annotation.
    generate({ pattern: widened })

    const narrowed = ["color", "animal"] as const
    generate({ pattern: narrowed })
  })
})

describe("count", () => {
  it("takes the options that choose words and returns an exact bigint", () => {
    expectTypeOf(count({ pattern: ["color", "animal"] })).toEqualTypeOf<bigint>()
    // @ts-expect-error -- maxLength does not change the count.
    count({ maxLength: 10 })
  })
})

describe("isCategory", () => {
  it("narrows a value to Category", () => {
    const value: unknown = "animal"

    if (isCategory(value)) expectTypeOf(value).toEqualTypeOf<Category>()
  })

  it("checks a parsed pattern so generate accepts it", () => {
    const pattern: unknown = ["color", "animal"]

    if (Array.isArray(pattern) && pattern.every((entry) => isCategory(entry))) {
      generate({ pattern })
    }
  })
})

describe("errors", () => {
  it("expose the invalid option and the reason", () => {
    expectTypeOf<InvalidOptionError["option"]>().toEqualTypeOf<string>()
    expectTypeOf<NotEnoughWordsReason>().toEqualTypeOf<"maxLength" | "unique">()
  })
})
