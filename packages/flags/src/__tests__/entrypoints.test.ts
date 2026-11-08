import { describe, expect, it } from "vitest"
import * as core from "#index.ts"
import * as react from "#integrations/react/index.tsx"
import * as testing from "#testing/index.ts"

describe("public entry points", () => {
  it("exposes the core surface", async () => {
    expect(Object.keys(core).toSorted()).toEqual(
      [
        "EvaluationAbortedError",
        "EvaluationTimeoutError",
        "FlagDefinitionError",
        "IdentityNotFoundError",
        "InvalidDecisionError",
        "ProviderFailedError",
        "anonymous",
        "createFlags",
        "decision",
        "defineProvider",
        "flag",
      ].toSorted()
    )
    const flags = core.createFlags({
      identify: () => ({ distinctId: "consumer" }),
      provider: core.defineProvider({ decideOne: () => core.decision.boolean(true), name: "p" }),
    })
    expect(await flags.get(core.flag.boolean("beta", false))).toBe(true)
  })

  it("exposes the React surface", () => {
    expect(Object.keys(react).toSorted()).toEqual(
      [
        "FeatureFlag",
        "FlagsProvider",
        "FlagsProviderMissingError",
        "useFlag",
        "useFlagCache",
        "useFlags",
      ].toSorted()
    )
  })

  it("exposes the testing surface", () => {
    expect(Object.keys(testing).toSorted()).toEqual(["fakeProvider", "memoryStore"])
  })

  it("keeps the React and testing entry points out of the core entry point", () => {
    expect(Object.keys(react).filter((name) => name in core)).toEqual([])
    expect(Object.keys(testing).filter((name) => name in core)).toEqual([])
  })
})
