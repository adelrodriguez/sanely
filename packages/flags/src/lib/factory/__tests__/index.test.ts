import { describe, expect, test } from "vitest"
import { createFlags } from "#lib/factory/index.ts"
import { decision } from "#lib/flag/decision.ts"
import { getEvaluatorRecord } from "#lib/flag/registry.ts"

describe("createFlags", () => {
  test("registers one record for its evaluators", async () => {
    const flag = createFlags({
      decide: () => decision.boolean(true),
      identify: () => ({ distinctId: "user" }),
    })
    const first = flag({ defaultValue: false, key: "first" })
    const second = flag({ defaultValue: false, key: "second" })
    const ref = getEvaluatorRecord(first)?.factoryRef

    expect(ref).toBe(getEvaluatorRecord(second)?.factoryRef)
    expect(getEvaluatorRecord(first)?.options.key).toBe("first")
    expect(getEvaluatorRecord({})).toBeUndefined()
    const batch = (await ref?.batch([first])) as readonly [boolean]
    expect(batch[0]).toBe(true)
  })
})
