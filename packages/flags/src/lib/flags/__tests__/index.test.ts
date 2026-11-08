import { setTimeout as sleep } from "node:timers/promises"
import { describe, expect, test, vi } from "vitest"
import type { ChangeListener } from "#lib/changes/index.ts"
import { decision } from "#lib/definition/decision.ts"
import { flag } from "#lib/definition/index.ts"
import { FlagDefinitionError } from "#lib/errors/index.ts"
import { createFlags } from "#lib/flags/index.ts"
import { anonymous, type Identity } from "#lib/identity/index.ts"
import { defineProvider } from "#lib/provider/index.ts"

const betaAccess = flag.boolean("beta-access", false)
const theme = flag.variant("theme", ["light", "dark"], "light")
const user: Identity = { distinctId: "user-1" }

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
    expect(() => createFlags({ provider, timeoutMs: 0 })).toThrow(FlagDefinitionError)
    expect(() => createFlags({ identify: "user" as never, provider })).toThrow(
      "identify must be a function"
    )
  })

  test("reads with identify through every reader method", async () => {
    const flags = createFlags({ identify: () => user, provider })

    expect(await flags.get(betaAccess)).toBe(true)
    expect(await flags.details(theme)).toEqual({
      flagKey: "theme",
      source: "provider",
      value: "dark",
    })
    expect(await flags.getMany([betaAccess, theme])).toEqual([true, "dark"])
    const [details] = await flags.detailsMany([theme])
    expect(details.value).toBe("dark")
  })

  test("returns only for and subscribe without identify", async () => {
    const flags = createFlags({ provider })

    expect(Object.keys(flags).toSorted()).toEqual(["for", "subscribe"])
    expect(await flags.for({ distinctId: "user-2" }).get(betaAccess)).toBe(false)
    expect(await flags.for(user).getMany([betaAccess])).toEqual([true])
  })

  test("falls back when for receives no identity", async () => {
    const details = await createFlags({ provider })
      .for(null as never)
      .details(betaAccess)

    expect(details.error?._tag).toBe("IdentityNotFoundError")
  })

  test("makes a snapshot of values, sources, and error tags", async () => {
    const flags = createFlags({ identify: () => user, provider })
    const missing = flag.variant("missing", ["a", "b"], "a")
    const strict = createFlags({
      identify: () => user,
      provider: defineProvider({ decideOne: () => decision.variant("c"), name: "strict" }),
    })

    expect(await flags.snapshot([betaAccess, theme])).toEqual({
      distinctId: "user-1",
      flags: {
        "beta-access": { kind: "boolean", source: "provider", value: true },
        theme: { kind: "variant", source: "provider", value: "dark" },
      },
    })
    expect(await strict.snapshot([missing])).toEqual({
      distinctId: "user-1",
      flags: {
        missing: { error: "InvalidDecisionError", kind: "variant", source: "default", value: "a" },
      },
    })
  })

  test("ends a snapshot at the deadline when identify never settles", async () => {
    const { promise: pending } = Promise.withResolvers<Identity>()
    const flags = createFlags({ identify: () => pending, provider, timeoutMs: 20 })
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

  test("makes a snapshot with a null distinctId for anonymous and a missing identity", async () => {
    const anonymousProvider = defineProvider({
      decideOne: (_item, _identity: Identity | typeof anonymous) => decision.boolean(true),
      name: "anonymous",
    })

    const anonymousSnapshot = await createFlags({
      identify: () => anonymous,
      provider: anonymousProvider,
    }).snapshot([betaAccess])
    expect(anonymousSnapshot.distinctId).toBeNull()
    expect(await createFlags({ identify: () => null, provider }).snapshot([betaAccess])).toEqual({
      distinctId: null,
      flags: {
        "beta-access": {
          error: "IdentityNotFoundError",
          kind: "boolean",
          source: "default",
          value: false,
        },
      },
    })
  })

  test("returns a no-op unsubscribe when the provider has no subscribe", () => {
    const unsubscribe = createFlags({ provider }).subscribe(() => null)

    expect(unsubscribe).not.toThrow()
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

  test("reports a throwing subscribe and returns a no-op unsubscribe", async () => {
    const onError = vi.fn()
    const flags = createFlags({
      onError,
      provider: defineProvider({
        decideOne: () => decision.boolean(true),
        name: "changes",
        subscribe: () => {
          throw new Error("subscribe failed")
        },
      }),
    })

    const unsubscribe = flags.subscribe(() => null)
    await sleep(0)

    expect(unsubscribe).not.toThrow()
    expect(onError).toHaveBeenCalledWith({
      _tag: "SubscribeFailed",
      error: new Error("subscribe failed"),
    })
  })

  test("copies the hooks so later changes to the array do not apply", async () => {
    const before = vi.fn()
    const hooks = [{ before }]
    const flags = createFlags({ hooks, identify: () => user, provider })
    hooks.push({ before: vi.fn() })

    await flags.get(betaAccess)

    expect(before).toHaveBeenCalledTimes(1)
  })
})
