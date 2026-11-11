import { describe, expect, test, vi } from "vitest"
import type { EvaluationContext } from "#lib/identity/index.ts"
import { flag } from "#lib/definition/index.ts"
import { getEvaluationKey, getIdentityKey } from "#lib/sharing/evaluation-key.ts"

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
  test("adds the parts of a custom key function to the default key", () => {
    const key = vi.fn((_context: EvaluationContext) => ["pro"])
    const base = getEvaluationKey(booleanContext, "test")

    expect(getEvaluationKey(booleanContext, "test", key)).toBe(`${base}array:[string:"pro"]`)
    expect(key).toHaveBeenCalledWith(booleanContext)
  })
})

describe("getIdentityKey", () => {
  test("reads only distinctId and the key fields, so any identity value is accepted", () => {
    const identity = { createdAt: new Date(0), distinctId: "user-1", n: 1n, tags: new Set(["a"]) }

    expect(getIdentityKey({ ...booleanContext, identity })).toEqual({
      distinctId: ["string", "user-1"],
      fields: "",
    })
    expect(getIdentityKey({ ...booleanContext, identity }, proKey)).toEqual({
      distinctId: ["string", "user-1"],
      fields: 'array:[string:"pro"]',
    })
  })

  test("is the identity part of the evaluation key", () => {
    const identityKey = getIdentityKey(variantContext, proKey)

    expect(getEvaluationKey(variantContext, "test", proKey)).toBe(
      `${JSON.stringify(["test", "theme", "variant", ["light", "dark"], ...(identityKey?.distinctId ?? [])])}${identityKey?.fields}`
    )
  })
})
