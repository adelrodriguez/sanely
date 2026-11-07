import { describe, expect, it } from "vitest"
import * as hooks from "#hooks/index.ts"
import * as core from "#index.ts"
import * as react from "#integrations/react/index.tsx"

describe("public entry points", () => {
  it("exposes the core flag factory", async () => {
    const factory = core.createFlags({
      decide: () => core.decision.boolean(true),
      identify: () => ({ distinctId: "consumer" }),
    })
    expect(await factory({ defaultValue: false, key: "beta" })()).toBe(true)
  })

  it("exposes hook helpers without the core factory", () => {
    expect(hooks.defineHook({})).toBeTypeOf("object")
    expect("createFlags" in hooks).toBe(false)
  })

  it("keeps the React integration out of the core entry point", () => {
    expect(Object.keys(react).filter((name) => name in core)).toEqual([])
  })

  it("exposes the final React surface", () => {
    expect(Object.keys(react).toSorted()).toEqual(
      [
        "FeatureFlag",
        "FlagProvider",
        "createFlagCache",
        "createFlagHooks",
        "useFlag",
        "useFlagBatch",
        "useFlagCache",
      ].toSorted()
    )
  })
})
