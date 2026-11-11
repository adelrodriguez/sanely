import { setTimeout as sleep } from "node:timers/promises"
import { describe, expect, test, vi } from "vitest"
import type { Decision, Flag, Hook, Identity } from "#index.ts"
import {
  anonymous,
  createFlags,
  decision,
  defineProvider,
  EvaluationAbortedError,
  EvaluationTimeoutError,
  flag,
  FlagDefinitionError,
  IdentityNotFoundError,
  InvalidDecisionError,
  ProviderFailedError,
} from "#index.ts"
import { fakeProvider } from "#testing/index.ts"

const user: Identity = { distinctId: "user123" }
const betaAccess = flag.boolean("beta-access", false)
const theme = flag.variant("theme", ["light", "dark", "system"], "light")

function provideOne(decide: (flag: Flag, identity: Identity) => unknown, name = "test") {
  return defineProvider({
    // The engine validates what the provider returns, so tests can return invalid decisions.
    decideOne: (item, identity: Identity) => decide(item, identity) as Decision,
    name,
  })
}

const alwaysTrue = provideOne(() => decision.boolean(true))

describe("flag definitions", () => {
  test.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 0, 2_147_483_648])(
    "rejects an invalid flag timeout of %p",
    (timeout) => {
      expect(() => flag.boolean("beta-access", false, { timeout })).toThrow(FlagDefinitionError)
      expect(() => flag.variant("theme", ["light"], "light", { timeout })).toThrow(
        FlagDefinitionError
      )
    }
  )

  test.each([
    { build: () => flag.boolean(1 as unknown as string, false), field: "key" },
    { build: () => flag.boolean("", false), field: "key" },
    { build: () => flag.boolean("beta", "yes" as unknown as boolean), field: "defaultValue" },
    {
      build: () => flag.variant("theme", "light" as unknown as ["light"], "light"),
      field: "variants",
    },
    { build: () => flag.variant("theme", [] as unknown as ["light"], "light"), field: "variants" },
    {
      build: () => flag.variant("theme", ["light", 1] as unknown as ["light"], "light"),
      field: "variants",
    },
    { build: () => flag.variant("theme", ["light", "light"], "light"), field: "variants" },
    {
      build: () => flag.variant("theme", ["light", "dark"], "system" as "light"),
      field: "defaultValue",
    },
    {
      build: () =>
        flag.variant("theme", ["light"], "light", {
          payload: "parse" as unknown as () => unknown,
        }),
      field: "payload",
    },
  ])("rejects an invalid $field at definition", ({ build, field }) => {
    expect(build).toThrow(FlagDefinitionError)
    expect(build).toThrow(field)
  })

  test("returns frozen data", () => {
    expect(betaAccess).toEqual({
      defaultValue: false,
      key: "beta-access",
      kind: "boolean",
      timeout: undefined,
    })
    expect(Object.isFrozen(betaAccess)).toBe(true)
    expect(Object.isFrozen(theme)).toBe(true)
    expect(Object.isFrozen(theme.variants)).toBe(true)
    expect(flag.variant("single", ["only"], "only").variants).toEqual(["only"])
  })

  test("copies the variants so later changes to the array do not leak in", () => {
    const variants: [string, string] = ["a", "b"]
    const defined = flag.variant("letters", variants, "a")
    variants[1] = "a"
    expect(defined.variants).toEqual(["a", "b"])
  })
})

describe("defineProvider", () => {
  test.each([
    { case: "a non-object", value: null },
    { case: "an empty name", value: { decideOne: () => decision.boolean(true), name: "" } },
    { case: "neither method", value: { name: "p" } },
    {
      case: "both methods",
      value: { decide: () => ({}), decideOne: () => decision.boolean(true), name: "p" },
    },
    { case: "a non-function decide", value: { decide: 1, name: "p" } },
    { case: "a non-function decideOne", value: { decideOne: 1, name: "p" } },
    {
      case: "a non-function subscribe",
      value: { decideOne: () => decision.boolean(true), name: "p", subscribe: 1 },
    },
  ])("rejects $case", ({ value }) => {
    expect(() => defineProvider(value as never)).toThrow(FlagDefinitionError)
  })

  test("returns a frozen copy", () => {
    const definition = { decideOne: () => decision.boolean(true), name: "p" }
    const provider = defineProvider(definition)
    expect(provider).not.toBe(definition)
    expect(Object.isFrozen(provider)).toBe(true)
  })
})

describe("createFlags", () => {
  test.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 0, 2_147_483_648])(
    "rejects an invalid reader timeout of %p",
    (timeout) => {
      expect(() => createFlags({ identify: () => user, provider: alwaysTrue, timeout })).toThrow(
        FlagDefinitionError
      )
    }
  )

  test("rejects an invalid provider", () => {
    expect(() => createFlags({ identify: () => user, provider: { name: "bad" } as never })).toThrow(
      FlagDefinitionError
    )
  })

  test("rejects an identify that is not a function", () => {
    expect(() =>
      createFlags({ identify: "user" as unknown as () => Identity, provider: alwaysTrue })
    ).toThrow(FlagDefinitionError)
  })

  test("accepts asynchronous identify and decide functions", async () => {
    const flags = createFlags({
      identify: () => Promise.resolve(user),
      provider: defineProvider({
        decideOne: () => Promise.resolve(decision.boolean(true)),
        name: "async",
      }),
    })

    expect(await flags.get(betaAccess)).toBe(true)
  })

  test("returns a reader without root reads when identify is absent", async () => {
    type RequestIdentity = Identity & { plan: "free" | "pro" }
    const decideOne = vi.fn((_flag: Flag, identity: RequestIdentity) =>
      decision.boolean(identity.plan === "pro")
    )
    const serverFlags = createFlags({ provider: defineProvider({ decideOne, name: "plans" }) })
    const identity: RequestIdentity = { distinctId: "user123", plan: "pro" }

    expect("get" in serverFlags).toBe(false)
    expect(Object.keys(serverFlags).toSorted()).toEqual(["dispose", "for", "subscribe"])
    expect(await serverFlags.for(identity).get(betaAccess)).toBe(true)
    expect(await serverFlags.for(identity).getMany([betaAccess])).toEqual([true])
    expect(decideOne).toHaveBeenCalledWith(betaAccess, identity, {
      signal: expect.any(AbortSignal),
    })
  })

  test("for() reads for the given identity without calling identify", async () => {
    const identify = vi.fn(() => ({ distinctId: "default" }))
    const flags = createFlags({
      identify,
      provider: provideOne((_flag, identity) =>
        decision.boolean(identity.distinctId === "override")
      ),
    })

    expect(await flags.for({ distinctId: "override" }).details(betaAccess)).toEqual({
      flagKey: "beta-access",
      source: "provider",
      value: true,
    })
    expect(identify).not.toHaveBeenCalled()
  })

  test("for() falls back with IdentityNotFoundError for a missing identity", async () => {
    const flags = createFlags({ provider: alwaysTrue })
    const details = await flags.for(undefined as unknown as Identity).details(betaAccess)

    expect(details.value).toBe(false)
    expect(details.error).toBeInstanceOf(IdentityNotFoundError)
  })

  test("fans out provider changes through a lazy subscription", async () => {
    let notify!: (keys?: readonly string[]) => void
    const detachProvider = vi.fn(() => null)
    const subscribe = vi.fn((listener: typeof notify) => {
      notify = listener
      return detachProvider
    })
    const flags = createFlags({
      identify: () => user,
      provider: defineProvider({ decideOne: () => decision.boolean(true), name: "p", subscribe }),
    })
    const observed: Array<readonly string[] | undefined> = []
    const throwingListener = vi.fn(() => {
      throw new Error("listener failed")
    })

    expect(subscribe).not.toHaveBeenCalled()
    const detachThrowingListener = flags.subscribe(throwingListener)
    const detachObservingListener = flags.subscribe((keys) => {
      observed.push(keys)
    })
    expect(subscribe).toHaveBeenCalledTimes(1)

    notify(["beta-access"])
    notify()
    await Promise.resolve()
    expect(throwingListener).toHaveBeenCalledTimes(2)
    expect(observed).toEqual([["beta-access"], undefined])

    detachThrowingListener()
    expect(detachProvider).not.toHaveBeenCalled()
    detachObservingListener()
    expect(detachProvider).toHaveBeenCalledTimes(1)
  })

  test("subscribe returns a no-op without a provider subscribe", () => {
    const flags = createFlags({ identify: () => user, provider: alwaysTrue })
    const unsubscribe = flags.subscribe(() => null)
    expect(unsubscribe).toBeTypeOf("function")
    expect(() => {
      unsubscribe()
    }).not.toThrow()
  })

  test("reports a throwing provider subscribe and returns a no-op", async () => {
    const onError = vi.fn()
    const failure = new Error("subscribe failed")
    const flags = createFlags({
      identify: () => user,
      onError,
      provider: defineProvider({
        decideOne: () => decision.boolean(true),
        name: "p",
        subscribe: () => {
          throw failure
        },
      }),
    })

    const unsubscribe = flags.subscribe(() => null)
    expect(() => {
      unsubscribe()
    }).not.toThrow()
    await sleep(0)
    expect(onError).toHaveBeenCalledWith({ _tag: "SubscribeFailed", error: failure })
  })
})

describe("evaluation", () => {
  test("evaluates boolean flags", async () => {
    const flags = createFlags({
      identify: () => user,
      provider: provideOne((item) => decision.boolean(item.key === "on")),
    })

    expect(await flags.get(flag.boolean("on", false))).toBe(true)
    expect(await flags.get(flag.boolean("off", true))).toBe(false)
  })

  test("returns provider evaluation details without changing the plain value", async () => {
    const flags = createFlags({ identify: () => user, provider: alwaysTrue })

    expect(await flags.details(betaAccess)).toEqual({
      flagKey: "beta-access",
      source: "provider",
      value: true,
    })
    expect(await flags.get(betaAccess)).toBe(true)
  })

  test("returns store evaluation details", async () => {
    const decideOne = vi.fn(() => decision.boolean(false))
    const flags = createFlags({
      cache: {
        store: {
          get: () => Promise.resolve(decision.boolean(true)),
          set: () => Promise.resolve(),
        },
      },
      identify: () => user,
      provider: defineProvider({ decideOne, name: "p" }),
    })

    expect(await flags.details(betaAccess)).toEqual({
      flagKey: "beta-access",
      source: "cache",
      value: true,
    })
    expect(decideOne).not.toHaveBeenCalled()
  })

  test("calls the provider on every read without a store", async () => {
    const decideOne = vi.fn(() => decision.boolean(true))
    const flags = createFlags({
      identify: () => user,
      provider: defineProvider({ decideOne, name: "p" }),
    })

    await flags.get(betaAccess)
    await flags.get(betaAccess)
    await flags.get(betaAccess)

    expect(decideOne).toHaveBeenCalledTimes(3)
  })

  test("passes the flag definition and identity to the provider", async () => {
    type CustomIdentity = Identity & { email: string; role: string }
    const identity: CustomIdentity = {
      distinctId: "user123",
      email: "u@example.com",
      role: "admin",
    }
    const decideOne = vi.fn((_flag: Flag, subject: CustomIdentity) =>
      decision.boolean(subject.role === "admin")
    )
    const flags = createFlags({
      identify: () => identity,
      provider: defineProvider({ decideOne, name: "roles" }),
    })

    expect(await flags.get(betaAccess)).toBe(true)
    expect(decideOne).toHaveBeenCalledWith(betaAccess, identity, {
      signal: expect.any(AbortSignal),
    })
  })

  test("decides one flag through a bulk provider", async () => {
    const decide = vi.fn((flags: readonly Flag[]) =>
      Object.fromEntries(flags.map((item) => [item.key, decision.boolean(true)]))
    )
    const flags = createFlags({
      identify: () => user,
      provider: defineProvider({ decide, name: "bulk" }),
    })

    expect(await flags.get(betaAccess)).toBe(true)
    expect(decide).toHaveBeenCalledWith([betaAccess], user, { signal: expect.any(AbortSignal) })
  })
})

describe("payloads", () => {
  test("surfaces raw variant payloads only through details", async () => {
    const payload = { experiment: "checkout-theme", version: 2 }
    const flags = createFlags({
      identify: () => user,
      provider: provideOne(() => decision.variant("dark", payload)),
    })

    expect(await flags.get(theme)).toBe("dark")
    const details = await flags.details(theme)
    expect(details).toEqual({ flagKey: "theme", payload, source: "provider", value: "dark" })
    if (details.source !== "default") expect(details.payload).toBe(payload)
  })

  test("returns the parsed payload", async () => {
    const parsed = flag.variant("parsed", ["light", "dark"], "light", {
      payload: (raw) => ({ accent: String(Reflect.get(raw as object, "accent")) }),
    })
    const flags = createFlags({
      identify: () => user,
      provider: provideOne(() => decision.variant("dark", { accent: "red", extra: true })),
    })

    expect(await flags.details(parsed)).toEqual({
      flagKey: "parsed",
      payload: { accent: "red" },
      source: "provider",
      value: "dark",
    })
  })

  test("does not call the parser without a payload", async () => {
    const parse = vi.fn(() => "parsed")
    const parsed = flag.variant("parsed", ["light", "dark"], "light", { payload: parse })
    const flags = createFlags({
      identify: () => user,
      provider: provideOne(() => decision.variant("dark")),
    })

    const details = await flags.details(parsed)
    expect("payload" in details).toBe(false)
    expect(parse).not.toHaveBeenCalled()
  })

  test("does not expose payloads from rejected variant decisions", async () => {
    const flags = createFlags({
      identify: () => user,
      provider: provideOne(() => decision.variant("purple", { experiment: "stale" })),
    })

    const details = await flags.details(theme)
    expect(details).toEqual({
      error: expect.any(InvalidDecisionError),
      flagKey: "theme",
      source: "default",
      value: "light",
    })
    expect("payload" in details).toBe(false)
  })
})

describe("evaluation errors", () => {
  test("IdentityNotFoundError when identify returns nothing", async () => {
    const identifiers: Array<() => Identity | null | Promise<null>> = [
      () => null,
      () => Promise.resolve(null),
    ]
    const results = await Promise.all(
      identifiers.map((identify) =>
        createFlags({ identify, provider: alwaysTrue }).details(betaAccess)
      )
    )
    for (const details of results) {
      expect(details).toEqual({
        error: expect.any(IdentityNotFoundError),
        flagKey: "beta-access",
        source: "default",
        value: false,
      })
      expect(details.error?._tag).toBe("IdentityNotFoundError")
    }
  })

  test("IdentityNotFoundError with the cause when identify throws", async () => {
    const failure = new Error("session expired")
    const decideOne = vi.fn(() => decision.boolean(true))
    const flags = createFlags({
      identify: () => Promise.reject(failure),
      provider: defineProvider({ decideOne, name: "p" }),
    })

    const details = await flags.details(betaAccess)
    expect(details.error).toBeInstanceOf(IdentityNotFoundError)
    expect(details.error?.cause).toBe(failure)
    expect(decideOne).not.toHaveBeenCalled()
  })

  test.each([
    { case: "a non-object", flagToRead: betaAccess, problem: "malformed", value: null },
    { case: "a missing type", flagToRead: betaAccess, problem: "malformed", value: {} },
    {
      case: "a string boolean value",
      flagToRead: betaAccess,
      problem: "malformed",
      value: { type: "boolean", value: "true" },
    },
    {
      case: "a non-string variant",
      flagToRead: theme,
      problem: "malformed",
      value: { type: "variant", variant: 1 },
    },
    {
      case: "a variant decision for a boolean flag",
      flagToRead: betaAccess,
      problem: "kind",
      value: decision.variant("dark"),
    },
    {
      case: "a boolean decision for a variant flag",
      flagToRead: theme,
      problem: "kind",
      value: decision.boolean(true),
    },
    {
      case: "an unknown variant",
      flagToRead: theme,
      problem: "variant",
      value: decision.variant("purple"),
    },
  ])("InvalidDecisionError for $case", async ({ value, flagToRead, problem }) => {
    const flags = createFlags({ identify: () => user, provider: provideOne(() => value) })
    const details = await flags.details(flagToRead)

    expect(details.source).toBe("default")
    expect(details.value).toBe(flagToRead.defaultValue)
    expect(details.error).toBeInstanceOf(InvalidDecisionError)
    expect(details.error?._tag).toBe("InvalidDecisionError")
    if (details.error instanceof InvalidDecisionError) {
      expect(details.error.decision).toBe(value)
      expect(details.error.problem).toBe(problem)
      expect(details.error.reason).toBeTypeOf("string")
    }
  })

  test("InvalidDecisionError when the payload parser throws", async () => {
    const failure = new Error("bad payload")
    const parsed = flag.variant("parsed", ["light", "dark"], "light", {
      payload: () => {
        throw failure
      },
    })
    const flags = createFlags({
      identify: () => user,
      provider: provideOne(() => decision.variant("dark", { accent: 1 })),
    })

    const details = await flags.details(parsed)
    expect(details.value).toBe("light")
    expect(details.error).toBeInstanceOf(InvalidDecisionError)
    expect(details.error).toHaveProperty("problem", "payload")
    expect(details.error?.cause).toBe(failure)
  })

  test("InvalidDecisionError when a bulk provider leaves out the key", async () => {
    const flags = createFlags({
      identify: () => user,
      provider: defineProvider({ decide: () => ({}), name: "bulk" }),
    })

    const details = await flags.details(betaAccess)
    expect(details.error).toBeInstanceOf(InvalidDecisionError)
    expect(details.error).toHaveProperty("problem", "missing")
    expect(details.error).toHaveProperty(
      "reason",
      "the provider returned no decision for this flag"
    )
  })

  test("does not treat inherited record properties as decisions", async () => {
    const flags = createFlags({
      identify: () => user,
      provider: defineProvider({ decide: () => ({}), name: "bulk" }),
    })

    const details = await flags.details(flag.boolean("toString", false))
    expect(details.error).toBeInstanceOf(InvalidDecisionError)
  })

  test("ProviderFailedError with the provider name and cause", async () => {
    const failure = new Error("Provider unavailable")
    const flags = createFlags({
      identify: () => user,
      provider: provideOne(() => {
        throw failure
      }, "launchdarkly"),
    })

    const details = await flags.details(betaAccess)
    expect(details).toEqual({
      error: expect.any(ProviderFailedError),
      flagKey: "beta-access",
      source: "default",
      value: false,
    })
    expect(details.error).toHaveProperty("provider", "launchdarkly")
    expect(details.error?.cause).toBe(failure)
    expect(details.error?._tag).toBe("ProviderFailedError")
  })

  test("ProviderFailedError for a rejecting bulk provider", async () => {
    const failure = new Error("bulk failed")
    const flags = createFlags({
      identify: () => user,
      provider: defineProvider({ decide: () => Promise.reject(failure), name: "bulk" }),
    })

    const details = await flags.details(betaAccess)
    expect(details.error).toBeInstanceOf(ProviderFailedError)
    expect(details.error?.cause).toBe(failure)
  })

  test("keeps an undefined rejection as the cause", async () => {
    const flags = createFlags({
      identify: () => user,
      provider: defineProvider({
        // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- Exercise hostile JavaScript providers.
        decideOne: () => Promise.reject<Decision>(),
        name: "p",
      }),
    })

    const details = await flags.details(betaAccess)
    expect(details.value).toBe(false)
    expect(details.error).toBeInstanceOf(ProviderFailedError)
    expect(details.error?.cause).toBeUndefined()
  })

  test("never rejects when the thrown value cannot be inspected", async () => {
    const { proxy, revoke } = Proxy.revocable({}, {})
    revoke()
    const flags = createFlags({
      identify: () => user,
      provider: provideOne(() => {
        // oxlint-disable-next-line typescript/only-throw-error -- Exercise hostile JavaScript providers.
        throw proxy
      }),
    })

    const details = await flags.details(betaAccess)
    expect(details.value).toBe(false)
    expect(details.error).toBeInstanceOf(ProviderFailedError)
  })

  test("ProviderFailedError when reading the provider's decision throws", async () => {
    const failure = new Error("hostile getter")
    const flags = createFlags({
      identify: () => user,
      provider: provideOne(
        () => ({
          get type(): never {
            throw failure
          },
        }),
        "launchdarkly"
      ),
    })

    const details = await flags.details(betaAccess)
    expect(details).toEqual({
      error: expect.any(ProviderFailedError),
      flagKey: "beta-access",
      source: "default",
      value: false,
    })
    expect(details.error).toHaveProperty("provider", "launchdarkly")
    expect(details.error?.cause).toBe(failure)
  })

  test("InvalidDecisionError for an anonymous or uncoalesced evaluation, without storing it", async () => {
    const store = {
      get: vi.fn(() => Promise.resolve(null)),
      set: vi.fn(() => Promise.resolve()),
    }
    const provider = defineProvider({
      decideOne: (_flag: Flag, _identity: Identity | typeof anonymous) => decision.variant("dark"),
      name: "test",
    })
    const readers = [
      createFlags({ cache: { store }, identify: () => anonymous, provider }),
      createFlags({ cache: { coalesce: false, store }, identify: () => user, provider }),
    ]

    const results = await Promise.all(readers.map((reader) => reader.details(betaAccess)))
    const fallback = {
      error: expect.any(InvalidDecisionError),
      flagKey: "beta-access",
      source: "default",
      value: false,
    }
    expect(results).toEqual([fallback, fallback])
    await sleep(0)
    expect(store.set).not.toHaveBeenCalled()
  })

  test("reads a reader timeout given as a time expression", async () => {
    const flags = createFlags({
      identify: () => user,
      provider: defineProvider({
        decideOne: () =>
          new Promise<Decision>(() => {
            // Never settles.
          }),
        name: "slow",
      }),
      timeout: "10ms",
    })

    const details = await flags.details(betaAccess)
    expect(details.error).toBeInstanceOf(EvaluationTimeoutError)
    expect(details.error).toHaveProperty("timeout", 10)
  })

  test("rejects a reader timeout that is not a time expression", () => {
    expect(() =>
      createFlags({ identify: () => user, provider: alwaysTrue, timeout: "soon" as "1s" })
    ).toThrow(FlagDefinitionError)
  })

  test("a flag timeout replaces the reader timeout", async () => {
    const flags = createFlags({
      identify: () => user,
      provider: defineProvider({
        decideOne: async () => {
          await sleep(30)
          return decision.boolean(true)
        },
        name: "slow",
      }),
      timeout: 5,
    })

    expect(await flags.get(flag.boolean("patient", false, { timeout: 500 }))).toBe(true)
    const eager = await flags.details(flag.boolean("eager", false))
    expect(eager.error).toBeInstanceOf(EvaluationTimeoutError)
  })

  test("EvaluationAbortedError with the signal reason", async () => {
    const reason = new Error("stop")
    const controller = new AbortController()
    const flags = createFlags({
      identify: () => user,
      provider: defineProvider({
        decideOne: () =>
          new Promise<Decision>(() => {
            // Never settles.
          }),
        name: "slow",
      }),
    })

    const pending = flags.details(betaAccess, { signal: controller.signal })
    controller.abort(reason)
    const details = await pending
    expect(details.error).toBeInstanceOf(EvaluationAbortedError)
    expect(details.error?.cause).toBe(reason)
    expect(details.error?._tag).toBe("EvaluationAbortedError")

    const already = await flags.details(betaAccess, { signal: controller.signal })
    expect(already.error).toBeInstanceOf(EvaluationAbortedError)
  })
})

describe("anonymous", () => {
  test("passes anonymous to a provider that accepts it", async () => {
    const decideOne = vi.fn((_flag: Flag, identity: Identity | typeof anonymous) =>
      decision.boolean(identity === anonymous)
    )
    const flags = createFlags({
      identify: () => anonymous,
      provider: defineProvider({ decideOne, name: "anon" }),
    })

    expect(await flags.get(betaAccess)).toBe(true)
    expect(decideOne).toHaveBeenCalledWith(betaAccess, anonymous, expect.any(Object))
    expect(
      await createFlags({ provider: defineProvider({ decideOne, name: "anon" }) })
        .for(anonymous)
        .get(betaAccess)
    ).toBe(true)
  })

  test("never caches or coalesces an anonymous evaluation", async () => {
    const store = {
      get: vi.fn(() => Promise.resolve(decision.boolean(true))),
      set: vi.fn(() => Promise.resolve()),
    }
    const decideOne = vi.fn(async (_flag: Flag, _identity: Identity | typeof anonymous) => {
      await sleep(5)
      return decision.boolean(false)
    })
    const flags = createFlags({
      cache: { coalesce: true, store },
      identify: () => anonymous,
      provider: defineProvider({ decideOne, name: "anon" }),
    })

    const results = await Promise.all([flags.details(betaAccess), flags.details(betaAccess)])
    await sleep(0)

    expect(results.map((result) => result.source)).toEqual(["provider", "provider"])
    expect(decideOne).toHaveBeenCalledTimes(2)
    expect(store.get).not.toHaveBeenCalled()
    expect(store.set).not.toHaveBeenCalled()
  })
})

describe("hooks", () => {
  test("runs before and after hooks", async () => {
    const before = vi.fn()
    const after = vi.fn()
    const flags = createFlags({
      hooks: [{ after, before }],
      identify: () => user,
      provider: alwaysTrue,
    })

    await flags.get(betaAccess)
    await sleep(0)

    expect(before).toHaveBeenCalledWith(
      expect.objectContaining({ flag: betaAccess, identity: user, signal: expect.any(AbortSignal) })
    )
    expect(after).toHaveBeenCalledWith(
      expect.objectContaining({ flag: betaAccess }),
      decision.boolean(true),
      {
        source: "provider",
      }
    )
  })

  test("runs error hooks with the evaluation error", async () => {
    const error = vi.fn()
    const flags = createFlags({
      hooks: [{ error }],
      identify: () => user,
      provider: provideOne(() => {
        throw new Error("Test error")
      }),
    })

    await flags.get(betaAccess)

    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ flag: betaAccess, identity: user }),
      expect.any(ProviderFailedError)
    )
  })

  test("runs finally hooks on success and on failure", async () => {
    const onFinally = vi.fn()
    const hooks: Hook[] = [{ finally: onFinally }]

    await createFlags({ hooks, identify: () => user, provider: alwaysTrue }).get(betaAccess)
    await createFlags({
      hooks,
      identify: () => Promise.reject(new Error("Identity error")),
      provider: alwaysTrue,
    }).get(betaAccess)
    await sleep(0)

    expect(onFinally).toHaveBeenCalledTimes(2)
  })
})

describe("snapshot", () => {
  test("records values, sources, error tags, and the distinctId", async () => {
    const flags = createFlags({
      identify: () => user,
      provider: fakeProvider([[betaAccess, true]]),
    })

    expect(await flags.snapshot([betaAccess, theme])).toEqual({
      distinctId: "user123",
      flags: {
        "beta-access": { kind: "boolean", source: "provider", value: true },
        theme: {
          error: "InvalidDecisionError",
          kind: "variant",
          source: "default",
          value: "light",
        },
      },
    })
  })

  test("records a null distinctId for anonymous and for a missing identity", async () => {
    const provider = fakeProvider([[betaAccess, true]])
    const anonymousSnapshot = await createFlags({ identify: () => anonymous, provider }).snapshot([
      betaAccess,
    ])
    const missing = await createFlags({ identify: () => null, provider }).snapshot([betaAccess])

    expect(anonymousSnapshot.distinctId).toBeNull()
    expect(missing).toEqual({
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

  test("serializes through JSON without loss", async () => {
    const flags = createFlags({ provider: fakeProvider([[theme, "dark"]]) })
    const snapshot = await flags.for({ distinctId: 7 }).snapshot([theme])

    expect(structuredClone(snapshot)).toEqual(snapshot)
    const wire = JSON.stringify(snapshot)
    expect(JSON.parse(wire) as unknown).toStrictEqual({ ...snapshot })
    expect(snapshot.distinctId).toBe(7)
  })

  test("resolves the identity once", async () => {
    const identify = vi.fn(() => user)
    await createFlags({ identify, provider: alwaysTrue }).snapshot([
      betaAccess,
      flag.boolean("other", false),
    ])

    expect(identify).toHaveBeenCalledTimes(1)
  })
})
