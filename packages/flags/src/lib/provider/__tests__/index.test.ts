import { describe, expect, test } from "vitest"
import { decision } from "#lib/definition/decision.ts"
import { flag } from "#lib/definition/index.ts"
import { FlagDefinitionError, InvalidDecisionError } from "#lib/errors/index.ts"
import { assertProvider, defineProvider, pickDecision } from "#lib/provider/index.ts"

const betaAccess = flag.boolean("beta-access", false)

function reasonOf(run: () => unknown): string | undefined {
  try {
    run()
  } catch (error) {
    if (error instanceof FlagDefinitionError) return error.reason
    throw error
  }
  return undefined
}

describe("defineProvider", () => {
  test("rejects an invalid definition", () => {
    expect(
      reasonOf(() => {
        assertProvider(null)
      })
    ).toBe("provider must be an object")
    expect(
      reasonOf(() => {
        assertProvider("p")
      })
    ).toBe("provider must be an object")
    expect(
      reasonOf(() => defineProvider({ decideOne: () => decision.boolean(true), name: "" }))
    ).toBe("provider name must be a non-empty string")
    expect(reasonOf(() => defineProvider({ name: "p" } as never))).toBe(
      "provider needs exactly one of decide and decideOne"
    )
    expect(
      reasonOf(() =>
        defineProvider({
          decide: () => ({}),
          decideOne: () => decision.boolean(true),
          name: "p",
        } as never)
      )
    ).toBe("provider needs exactly one of decide and decideOne")
    expect(reasonOf(() => defineProvider({ decide: 1, name: "p" } as never))).toBe(
      "provider decide must be a function"
    )
    expect(reasonOf(() => defineProvider({ decideOne: 1, name: "p" } as never))).toBe(
      "provider decideOne must be a function"
    )
    expect(
      reasonOf(() =>
        defineProvider({
          decideOne: () => decision.boolean(true),
          name: "p",
          subscribe: 1,
        } as never)
      )
    ).toBe("provider subscribe must be a function")
  })
})

describe("pickDecision", () => {
  test("rejects a missing key or a result that is not an object", () => {
    for (const result of [{}, null, "x", { other: 1 }]) {
      expect(() => pickDecision(result, betaAccess)).toThrow(InvalidDecisionError)
    }
  })
})
