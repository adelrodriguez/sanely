import { describe, expect, test } from "vitest"
import { assertTimeoutMs, flag } from "#lib/definition/index.ts"
import { FlagDefinitionError } from "#lib/errors/index.ts"

function reasonOf(run: () => unknown): string | undefined {
  try {
    run()
  } catch (error) {
    if (error instanceof FlagDefinitionError) return error.reason
    throw error
  }
  return undefined
}

describe("flag.boolean", () => {
  test("returns a frozen boolean definition", () => {
    const betaAccess = flag.boolean("beta-access", true, { timeoutMs: 100 })

    expect(betaAccess).toEqual({
      defaultValue: true,
      key: "beta-access",
      kind: "boolean",
      timeoutMs: 100,
    })
    expect(Object.isFrozen(betaAccess)).toBe(true)
    expect(flag.boolean("other", false).timeoutMs).toBeUndefined()
  })

  test("rejects an invalid key, default, or timeout", () => {
    expect(reasonOf(() => flag.boolean("", false))).toMatch(/key must be a non-empty string/)
    expect(reasonOf(() => flag.boolean(1 as never, false))).toMatch(/key must be/)
    expect(reasonOf(() => flag.boolean("beta", "yes" as never))).toBe(
      "defaultValue must be a boolean; received yes"
    )
    expect(reasonOf(() => flag.boolean("beta", false, { timeoutMs: 0 }))).toMatch(/timeoutMs/)
  })
})

describe("flag.variant", () => {
  test("returns a frozen variant definition with a copy of the variants", () => {
    const variants = ["light", "dark"] as const
    const theme = flag.variant("theme", variants, "dark", { payload: String })

    expect(theme).toEqual({
      defaultValue: "dark",
      key: "theme",
      kind: "variant",
      payload: String,
      timeoutMs: undefined,
      variants: ["light", "dark"],
    })
    expect(theme.variants).not.toBe(variants)
    expect(Object.isFrozen(theme)).toBe(true)
    expect(Object.isFrozen(theme.variants)).toBe(true)
  })

  test("rejects invalid variants and defaults", () => {
    expect(reasonOf(() => flag.variant("", ["a"], "a"))).toMatch(/key must be/)
    expect(reasonOf(() => flag.variant("v", [] as never, "a" as never))).toBe(
      "variants must be a non-empty array"
    )
    expect(reasonOf(() => flag.variant("v", "a" as never, "a" as never))).toBe(
      "variants must be a non-empty array"
    )
    expect(reasonOf(() => flag.variant("v", ["a", 1] as never, "a" as never))).toBe(
      "variants must contain only strings; received 1"
    )
    expect(reasonOf(() => flag.variant("v", ["a", "a"], "a"))).toBe(
      "variants must be unique; duplicate value: a"
    )
    expect(reasonOf(() => flag.variant("v", ["a", "b"], "c" as never))).toBe(
      "defaultValue must be one of the variants; received c"
    )
    expect(reasonOf(() => flag.variant("v", ["a"], "a", { payload: 1 as never }))).toBe(
      "payload must be a function"
    )
    expect(reasonOf(() => flag.variant("v", ["a"], "a", { timeoutMs: -1 }))).toMatch(/timeoutMs/)
  })
})

describe("assertTimeoutMs", () => {
  test("accepts undefined and positive finite delays within the timer limit", () => {
    expect(() => {
      assertTimeoutMs(flag.boolean("beta", false).timeoutMs)
    }).not.toThrow()
    expect(() => {
      assertTimeoutMs(2_147_483_647)
    }).not.toThrow()
  })

  test("rejects other values", () => {
    for (const value of [0, -1, Number.NaN, Infinity, 2_147_483_648, "10"]) {
      expect(() => {
        assertTimeoutMs(value)
      }).toThrow(FlagDefinitionError)
    }
  })
})
