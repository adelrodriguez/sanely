import { describe, expect, test } from "vitest"
import { flag, parseTimeout } from "#lib/definition/index.ts"
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
  test("reads a timeout given as a time expression", () => {
    expect(flag.boolean("beta", false, { timeout: "300ms" }).timeout).toBe(300)
    expect(flag.variant("theme", ["light"], "light", { timeout: "2s" }).timeout).toBe(2000)
  })

  test("rejects an invalid key, default, or timeout", () => {
    expect(reasonOf(() => flag.boolean("", false))).toMatch(/key must be a non-empty string/)
    expect(reasonOf(() => flag.boolean(1 as never, false))).toMatch(/key must be/)
    expect(reasonOf(() => flag.boolean("beta", "yes" as never))).toBe(
      "defaultValue must be a boolean; received yes"
    )
    expect(reasonOf(() => flag.boolean("beta", false, { timeout: 0 }))).toMatch(/timeout/)
  })
})

describe("flag.variant", () => {
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
    expect(reasonOf(() => flag.variant("v", ["a"], "a", { timeout: -1 }))).toMatch(/timeout/)
  })
})

describe("parseTimeout", () => {
  test("reads milliseconds and time expressions within the timer limit", () => {
    expect(parseTimeout(flag.boolean("beta", false).timeout)).toBeUndefined()
    expect(parseTimeout(250)).toBe(250)
    expect(parseTimeout(2_147_483_647)).toBe(2_147_483_647)
    expect(parseTimeout("500ms")).toBe(500)
    expect(parseTimeout("1.5s")).toBe(1500)
    expect(parseTimeout("1m")).toBe(60_000)
  })

  test("rejects other values and names the value it received", () => {
    for (const value of [0, -1, Number.NaN, Infinity, 2_147_483_648, "0s", "25d", true, {}]) {
      expect(() => parseTimeout(value)).toThrow(FlagDefinitionError)
    }
    expect(reasonOf(() => parseTimeout("soon"))).toMatch(/received "soon"$/)
    expect(reasonOf(() => parseTimeout("1M"))).toMatch(/received "1M"$/)
    expect(reasonOf(() => parseTimeout(0))).toMatch(/received 0$/)
  })
})
