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

const proKey = () => ["pro"]

describe("getEvaluationKey", () => {
  test("encodes the provider, flag key, flag shape, and typed distinctId by default", () => {
    expect(getEvaluationKey(booleanContext, "test")).toBe(
      JSON.stringify(["test", "beta-access", "boolean", undefined, "string", "user-1"])
    )
    expect(getEvaluationKey(variantContext, "test")).toBe(
      JSON.stringify(["test", "theme", "variant", ["light", "dark"], "number", "42"])
    )
  })

  test("keeps the decisions of different providers apart", () => {
    expect(getEvaluationKey(booleanContext, "production")).not.toBe(
      getEvaluationKey(booleanContext, "staging")
    )
  })

  test("keeps a numeric and a string distinctId with one text apart", () => {
    const numeric = getEvaluationKey({ ...booleanContext, identity: { distinctId: 7 } }, "test")
    const text = getEvaluationKey({ ...booleanContext, identity: { distinctId: "7" } }, "test")

    expect(numeric).not.toBe(text)
  })

  test("returns undefined before the identity resolves and for anonymous", () => {
    const key = vi.fn(() => ["custom"])

    expect(getEvaluationKey({ ...booleanContext, identity: null }, "test")).toBeUndefined()
    expect(getEvaluationKey({ ...booleanContext, identity: null }, "test", key)).toBeUndefined()
    expect(
      getEvaluationKey({ ...booleanContext, identity: anonymous }, "test", key)
    ).toBeUndefined()
    expect(key).not.toHaveBeenCalled()
  })

  test("adds the parts of a custom key function to the default key", () => {
    const key = vi.fn((_context: EvaluationContext) => ["pro"])
    const base = getEvaluationKey(booleanContext, "test")

    expect(getEvaluationKey(booleanContext, "test", key)).toBe(`${base}array:[string:"pro"]`)
    expect(key).toHaveBeenCalledWith(booleanContext)
  })

  test("keeps the parts of a custom key apart from the flag", () => {
    expect(getEvaluationKey(booleanContext, "test", proKey)).not.toBe(
      getEvaluationKey({ ...booleanContext, flag: flag.boolean("other", false) }, "test", proKey)
    )
    expect(getEvaluationKey(booleanContext, "test", () => ["pro"])).not.toBe(
      getEvaluationKey(booleanContext, "test", () => ["free"])
    )
  })
})
