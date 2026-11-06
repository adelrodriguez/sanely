import { describe, expectTypeOf, it } from "vitest"
import type { InvalidNameError } from "#index.ts"
import { greet } from "#index.ts"

describe("greet", () => {
  it("returns a greeting template literal", () => {
    expectTypeOf(greet("Ada")).toEqualTypeOf<`Hello, ${string}!`>()
  })

  it("accepts only strings", () => {
    // @ts-expect-error -- greet takes a string.
    greet(1)
  })
})

describe("InvalidNameError", () => {
  it("stores the input", () => {
    expectTypeOf<InvalidNameError["value"]>().toEqualTypeOf<string>()
  })
})
