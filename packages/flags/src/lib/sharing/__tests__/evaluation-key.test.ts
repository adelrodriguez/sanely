import { describe, expect, test, vi } from "vitest"
import type { EvaluationContext } from "#lib/identity/index.ts"
import { flag } from "#lib/definition/index.ts"
import { getEvaluationKey } from "#lib/sharing/evaluation-key.ts"

const signal = new AbortController().signal

const booleanContext: EvaluationContext = {
  flag: flag.boolean("beta-access", false),
  identity: { distinctId: "user-1" },
  signal,
}

describe("getEvaluationKey", () => {
  test("adds the parts of a custom key function to the default key", () => {
    const key = vi.fn((_context: EvaluationContext) => ["pro"])
    const base = getEvaluationKey(booleanContext, "test")

    expect(getEvaluationKey(booleanContext, "test", key)).toBe(`${base}array:[string:"pro"]`)
    expect(key).toHaveBeenCalledWith(booleanContext)
  })
})
