import { describe, expect, test, vi } from "vitest"
import { flag } from "#lib/definition/index.ts"
import { anonymous, type EvaluationContext } from "#lib/identity/index.ts"
import { getEvaluationKey } from "#lib/sharing/evaluation-key.ts"

const signal = new AbortController().signal

const booleanContext: EvaluationContext = {
  flag: flag.boolean("beta-access", false),
  identity: { distinctId: "user-1" },
  signal,
}

const variantContext: EvaluationContext = {
  flag: flag.variant("theme", ["light", "dark"], "light"),
  identity: { distinctId: 42 },
  signal,
}

describe("getEvaluationKey", () => {
  test("encodes the flag key, flag shape, and typed distinctId by default", () => {
    expect(getEvaluationKey(booleanContext)).toBe(
      JSON.stringify(["beta-access", "boolean", undefined, "string", "user-1"])
    )
    expect(getEvaluationKey(variantContext)).toBe(
      JSON.stringify(["theme", "variant", ["light", "dark"], "number", "42"])
    )
  })

  test("keeps a numeric and a string distinctId with one text apart", () => {
    const numeric = getEvaluationKey({ ...booleanContext, identity: { distinctId: 7 } })
    const text = getEvaluationKey({ ...booleanContext, identity: { distinctId: "7" } })

    expect(numeric).not.toBe(text)
  })

  test("returns undefined before the identity resolves and for anonymous", () => {
    const key = vi.fn(() => "custom")

    expect(getEvaluationKey({ ...booleanContext, identity: null })).toBeUndefined()
    expect(getEvaluationKey({ ...booleanContext, identity: null }, key)).toBeUndefined()
    expect(getEvaluationKey({ ...booleanContext, identity: anonymous }, key)).toBeUndefined()
    expect(key).not.toHaveBeenCalled()
  })

  test("uses a custom key function", () => {
    const key = vi.fn((context: EvaluationContext) => `custom:${context.flag.key}`)

    expect(getEvaluationKey(booleanContext, key)).toBe("custom:beta-access")
    expect(key).toHaveBeenCalledWith(booleanContext)
  })
})
