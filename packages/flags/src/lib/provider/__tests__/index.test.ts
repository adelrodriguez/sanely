import { describe, expect, test, vi } from "vitest"
import type { Identity } from "#lib/identity/index.ts"
import { decision } from "#lib/definition/decision.ts"
import { flag } from "#lib/definition/index.ts"
import {
  FlagDefinitionError,
  InvalidDecisionError,
  ProviderFailedError,
} from "#lib/errors/index.ts"
import { assertProvider, defineProvider, pickDecision, providerCalls } from "#lib/provider/index.ts"

const betaAccess = flag.boolean("beta-access", false)
const theme = flag.variant("theme", ["light", "dark"], "light")
const identity: Identity = { distinctId: "u" }
const options = { signal: new AbortController().signal }

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
  test("returns a frozen copy of the definition", () => {
    const definition = { decideOne: () => decision.boolean(true), name: "test" }
    const provider = defineProvider(definition)

    expect(provider).toEqual(definition)
    expect(provider).not.toBe(definition)
    expect(Object.isFrozen(provider)).toBe(true)
  })

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
  test("reads one flag's decision from a bulk result", () => {
    expect(pickDecision({ "beta-access": decision.boolean(true) }, betaAccess)).toEqual(
      decision.boolean(true)
    )
  })

  test("rejects a missing key or a result that is not an object", () => {
    for (const result of [{}, null, "x", { other: 1 }]) {
      expect(() => pickDecision(result, betaAccess)).toThrow(InvalidDecisionError)
    }
  })
})

describe("providerCalls", () => {
  test("calls decideOne for one flag and has no decideMany", async () => {
    const decideOne = vi.fn(() => decision.boolean(true))
    const subscribe = vi.fn(() => () => null)
    const calls = providerCalls(defineProvider({ decideOne, name: "one", subscribe }))

    await expect(calls.decideOne(betaAccess, identity, options)).resolves.toEqual(
      decision.boolean(true)
    )
    expect(decideOne).toHaveBeenCalledWith(betaAccess, identity, options)
    expect(calls.decideMany).toBeUndefined()
    expect(calls.subscribe).toBe(subscribe)
    expect(calls.name).toBe("one")
  })

  test("asks a bulk provider for one flag and picks its decision", async () => {
    const decide = vi.fn((flags: ReadonlyArray<{ key: string }>) =>
      Object.fromEntries(flags.map((item) => [item.key, decision.variant("dark")]))
    )
    const calls = providerCalls(defineProvider({ decide, name: "bulk" }))

    await expect(calls.decideOne(theme, identity, options)).resolves.toEqual(
      decision.variant("dark")
    )
    expect(decide).toHaveBeenCalledWith([theme], identity, options)
    await expect(calls.decideMany?.([theme, betaAccess], identity, options)).resolves.toEqual({
      "beta-access": decision.variant("dark"),
      theme: decision.variant("dark"),
    })
  })

  test("rejects a bulk result without the flag", async () => {
    const calls = providerCalls(defineProvider({ decide: () => ({}), name: "bulk" }))

    await expect(calls.decideOne(theme, identity, options)).rejects.toBeInstanceOf(
      InvalidDecisionError
    )
  })

  test("wraps a throwing or rejecting provider in ProviderFailedError", async () => {
    const cause = new Error("down")
    const one = providerCalls(
      defineProvider({
        decideOne: () => {
          throw cause
        },
        name: "one",
      })
    )
    const bulk = providerCalls(
      defineProvider({ decide: () => Promise.reject(cause), name: "bulk" })
    )

    await expect(one.decideOne(betaAccess, identity, options)).rejects.toMatchObject({
      _tag: "ProviderFailedError",
      cause,
      provider: "one",
    })
    await expect(bulk.decideMany?.([betaAccess], identity, options)).rejects.toBeInstanceOf(
      ProviderFailedError
    )
  })
})
