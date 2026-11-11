import { setTimeout as sleep } from "node:timers/promises"
import { describe, expect, test, vi } from "vitest"
import type { ChangeListener } from "#lib/changes/index.ts"
import type { Identity } from "#lib/identity/index.ts"
import { decision } from "#lib/definition/decision.ts"
import { flag } from "#lib/definition/index.ts"
import { FlagDefinitionError } from "#lib/errors/index.ts"
import { createFlags } from "#lib/flags/index.ts"
import { defineProvider } from "#lib/provider/index.ts"

const betaAccess = flag.boolean("beta-access", false)

const provider = defineProvider({
  decideOne: (item, identity: Identity) =>
    item.kind === "boolean"
      ? decision.boolean(identity.distinctId === "user-1")
      : decision.variant("dark"),
  name: "test",
})

describe("createFlags", () => {
  test("validates its options", () => {
    expect(() => createFlags({ provider: {} as never })).toThrow(FlagDefinitionError)
    expect(() => createFlags({ provider, timeout: 0 })).toThrow(FlagDefinitionError)
    expect(() => createFlags({ identify: "user" as never, provider })).toThrow(
      "identify must be a function"
    )
  })

  test("ends a snapshot at the deadline when identify never settles", async () => {
    const { promise: pending } = Promise.withResolvers<Identity>()
    const flags = createFlags({ identify: () => pending, provider, timeout: 20 })
    const aborted = new AbortController()
    aborted.abort(new Error("stop"))

    expect(await flags.snapshot([betaAccess])).toEqual({
      distinctId: null,
      flags: {
        "beta-access": {
          error: "EvaluationTimeoutError",
          kind: "boolean",
          source: "default",
          value: false,
        },
      },
    })
    expect(await flags.snapshot([betaAccess], { signal: aborted.signal })).toMatchObject({
      flags: { "beta-access": { error: "EvaluationAbortedError" } },
    })
  })

  test("sends provider changes to listeners in the background", async () => {
    let notify: ChangeListener | undefined
    const detach = vi.fn()
    const flags = createFlags({
      provider: defineProvider({
        decideOne: () => decision.boolean(true),
        name: "changes",
        subscribe: (listener) => {
          notify = listener
          return detach
        },
      }),
    })
    const listener = vi.fn()

    const unsubscribe = flags.subscribe(listener)
    notify?.(["beta-access"])
    expect(listener).not.toHaveBeenCalled()
    await sleep(0)
    expect(listener).toHaveBeenCalledWith(["beta-access"])

    unsubscribe()
    expect(detach).toHaveBeenCalledTimes(1)
  })
})
