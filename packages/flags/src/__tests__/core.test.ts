import { setTimeout as sleep } from "node:timers/promises"
import { describe, expect, test, vi } from "vitest"
import type { Decision, EvaluationDetails, Hook, Identity } from "#lib/types/index.ts"
import { decision } from "#decision.ts"
import { createFlags } from "#factory.ts"
import { getEvaluatorRecord } from "#lib/flag/registry.ts"
import { IdentityNotFoundError, MalformedDecisionError } from "#lib/shared/errors.ts"

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
  test.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 0, 2_147_483_648])(
    "rejects an invalid factory timeout of %p",
    (timeoutMs) => {
      expect(() =>
        createFlags({
          decide: () => ({ type: "boolean", value: true }),
          identify: () => ({ distinctId: "user123" }),
          timeoutMs,
        })
      ).toThrow(RangeError)
    }
  )

  test.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 0, 2_147_483_648])(
    "rejects an invalid per-flag timeout of %p",
    (timeoutMs) => {
      const flag = createFlags({
        decide: () => ({ type: "boolean", value: true }),
        identify: () => ({ distinctId: "user123" }),
      })

      expect(() => flag({ defaultValue: false, key: "beta-access", timeoutMs })).toThrow(RangeError)
    }
  )

  test.each([
    { field: "key", options: { defaultValue: false, key: 1 } },
    { field: "key", options: { defaultValue: false, key: "" } },
    { field: "defaultValue", options: { defaultValue: "light", key: "theme" } },
    {
      field: "variants",
      options: { defaultValue: "light", key: "theme", variants: "light" },
    },
    { field: "variants", options: { defaultValue: "light", key: "theme", variants: [] } },
    {
      field: "variants",
      options: { defaultValue: "light", key: "theme", variants: ["light", 1] },
    },
    {
      field: "variants",
      options: { defaultValue: "light", key: "theme", variants: ["light", "light"] },
    },
    {
      field: "defaultValue",
      options: { defaultValue: "system", key: "theme", variants: ["light", "dark"] },
    },
  ])("rejects invalid $field flag options at creation", ({ field, options }) => {
    const flag = createFlags({
      decide: () => ({ type: "boolean", value: true }),
      identify: () => ({ distinctId: "user123" }),
    })

    // @ts-expect-error -- Exercise runtime validation for JavaScript and untyped callers.
    expect(() => flag(options)).toThrow(field)
  })

  test("constructs valid boolean and single-variant evaluators", () => {
    const flag = createFlags({
      decide: () => ({ type: "boolean", value: true }),
      identify: () => ({ distinctId: "user123" }),
    })

    expect(flag({ defaultValue: false, key: "beta-access" })).toBeTypeOf("function")
    expect(flag({ defaultValue: "light", key: "theme", variants: ["light"] })).toBeTypeOf(
      "function"
    )
  })

  test("creates a flag factory function", () => {
    const flag = createFlags({
      decide: () => Promise.resolve({ type: "boolean", value: true } as const),
      identify: () => Promise.resolve({ distinctId: "user123" }),
    })

    expect(typeof flag).toBe("function")
  })

  test("accepts synchronous identify and decide functions", async () => {
    const flag = createFlags({
      decide: (_key, identity) => ({ type: "boolean", value: identity.distinctId === "user123" }),
      identify: () => ({ distinctId: "user123" }),
    })

    const betaFlag = flag({ defaultValue: false, key: "beta-access" })

    expect(await betaFlag()).toBe(true)
  })

  test("supports a factory that requires an identity from every caller", async () => {
    type RequestIdentity = Identity & { plan: "free" | "pro" }
    const decide = vi.fn((_key: string, identity: RequestIdentity) =>
      decision.boolean(identity.plan === "pro")
    )
    const flag = createFlags<RequestIdentity>({ decide })
    const betaFlag = flag({ defaultValue: false, key: "beta-access" })
    const identity: RequestIdentity = { distinctId: "user123", plan: "pro" }

    expect(await betaFlag({ identity })).toBe(true)
    const batch = await flag.batch([betaFlag], { identity })
    expect(batch.get(betaFlag)).toBe(true)

    const runtimeFlag = betaFlag as unknown as {
      (): Promise<boolean>
      details(): Promise<EvaluationDetails<boolean>>
    }
    expect(await runtimeFlag()).toBe(false)
    const details = await runtimeFlag.details()
    expect(details.value).toBe(false)
    expect(details.error).toBeInstanceOf(IdentityNotFoundError)
  })

  test("fans out provider changes through a lazy factory subscription", async () => {
    let notify!: (change: { keys?: readonly string[] }) => void
    const detachProvider = vi.fn(() => null)
    const subscribe = vi.fn((listener: typeof notify) => {
      notify = listener
      return detachProvider
    })
    const flag = createFlags({
      decide: () => decision.boolean(true),
      identify: () => ({ distinctId: "user123" }),
      subscribe,
    })
    const observed: Array<readonly string[] | undefined> = []
    const throwingListener = vi.fn(() => {
      throw new Error("listener failed")
    })

    expect(subscribe).not.toHaveBeenCalled()
    const detachThrowingListener = flag.changes.subscribe(throwingListener)
    const detachObservingListener = flag.changes.subscribe((keys) => {
      observed.push(keys)
    })
    expect(subscribe).toHaveBeenCalledTimes(1)

    notify({ keys: ["beta-access"] })
    notify({})
    await Promise.resolve()
    expect(throwingListener).toHaveBeenCalledTimes(2)
    expect(observed).toEqual([["beta-access"], undefined])

    detachThrowingListener()
    expect(detachProvider).not.toHaveBeenCalled()
    detachObservingListener()
    expect(detachProvider).toHaveBeenCalledTimes(1)
  })

  test("creates boolean flag that evaluates to true", async () => {
    const identity: Identity = { distinctId: "user123" }
    const decision: Decision = { type: "boolean", value: true }

    const flag = createFlags({
      decide: vi.fn(() => Promise.resolve(decision)),
      identify: vi.fn(() => Promise.resolve(identity)),
    })

    const betaFlag = flag({ defaultValue: false, key: "beta-access" })
    const result = await betaFlag()

    expect(result).toBe(true)
  })

  test("returns provider evaluation details without changing the plain value", async () => {
    const flag = createFlags({
      decide: () => ({ type: "boolean", value: true }),
      identify: () => ({ distinctId: "user123" }),
    })
    const betaFlag = flag({ defaultValue: false, key: "beta-access" })

    expect(await betaFlag.details()).toEqual({
      flagKey: "beta-access",
      source: "provider",
      value: true,
    })
    expect(await betaFlag()).toBe(true)
  })

  test("returns cache evaluation details", async () => {
    const flag = createFlags({
      cache: {
        get: () => Promise.resolve({ type: "boolean", value: true }),
        set: () => Promise.resolve(),
      },
      decide: () => ({ type: "boolean", value: false }),
      identify: () => ({ distinctId: "user123" }),
    })
    const betaFlag = flag({ defaultValue: false, key: "beta-access" })

    expect(await betaFlag.details()).toEqual({
      flagKey: "beta-access",
      source: "cache",
      value: true,
    })
  })

  test("returns the provider error with default evaluation details", async () => {
    const error = new Error("Provider unavailable")
    const flag = createFlags({
      decide: () => Promise.reject(error),
      identify: () => ({ distinctId: "user123" }),
    })
    const betaFlag = flag({ defaultValue: false, key: "beta-access" })

    expect(await betaFlag.details()).toEqual({
      error,
      flagKey: "beta-access",
      source: "default",
      value: false,
    })
  })

  test("normalizes undefined rejections without hiding the failure", async () => {
    const flag = createFlags({
      // oxlint-disable-next-line eslint/arrow-body-style -- Keep the intentional invalid rejection localized.
      decide: () => {
        // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- Exercise hostile JavaScript callers.
        return Promise.reject<Decision>()
      },
      identify: () => ({ distinctId: "user123" }),
    })
    const betaFlag = flag({ defaultValue: false, key: "beta-access" })

    expect(await betaFlag()).toBe(false)

    const details = await betaFlag.details()
    expect(details.source).toBe("default")
    if (details.source === "default") {
      expect(details.error).toBeInstanceOf(Error)
      expect(details.error.message).toBe("undefined")
    }
  })

  test("never rejects when error inspection throws", async () => {
    const { proxy, revoke } = Proxy.revocable({}, {})
    revoke()
    const flag = createFlags({
      decide: () => {
        // oxlint-disable-next-line typescript/only-throw-error -- Exercise hostile JavaScript callers.
        throw proxy
      },
      identify: () => ({ distinctId: "user123" }),
    })
    const betaFlag = flag({ defaultValue: false, key: "beta-access" })

    expect(await betaFlag()).toBe(false)

    const details = await betaFlag.details()
    expect(details.source).toBe("default")
    if (details.source === "default") {
      expect(details.error).toBeInstanceOf(Error)
      expect(details.error.message).toBe("Uninspectable value thrown")
    }
  })

  test("returns the identity error with default evaluation details", async () => {
    const flag = createFlags({
      decide: () => ({ type: "boolean", value: true }),
      identify: () => null,
    })
    const betaFlag = flag({ defaultValue: false, key: "beta-access" })
    const details = await betaFlag.details()

    expect(details).toEqual({
      error: expect.any(Error),
      flagKey: "beta-access",
      source: "default",
      value: false,
    })
    expect(details.error).toHaveProperty("message", "Identity not found")
  })

  test("details accepts an override identity", async () => {
    const identify = vi.fn(() => ({ distinctId: "default" }))
    const overrideIdentity = { distinctId: "override" }
    const flag = createFlags({
      decide: (_key, identity) => ({ type: "boolean", value: identity.distinctId === "override" }),
      identify,
    })
    const betaFlag = flag({ defaultValue: false, key: "beta-access" })

    expect(await betaFlag.details({ identity: overrideIdentity })).toEqual({
      flagKey: "beta-access",
      source: "provider",
      value: true,
    })
    expect(identify).not.toHaveBeenCalled()
  })

  test("preserves variant value inference in evaluation details", async () => {
    const flag = createFlags({
      decide: () => ({ type: "variant", variant: "dark" }),
      identify: () => ({ distinctId: "user123" }),
    })
    const themeFlag = flag({
      defaultValue: "light",
      key: "theme",
      variants: ["light", "dark", "system"],
    })

    const details: EvaluationDetails<"light" | "dark" | "system"> = await themeFlag.details()

    expect(details).toEqual({ flagKey: "theme", source: "provider", value: "dark" })
  })

  test("surfaces variant payloads only through evaluation details", async () => {
    const payload = { experiment: "checkout-theme", version: 2 }
    const flag = createFlags({
      decide: () => ({ payload, type: "variant", variant: "dark" }),
      identify: () => ({ distinctId: "user123" }),
    })
    const themeFlag = flag({
      defaultValue: "light",
      key: "theme",
      variants: ["light", "dark"],
    })

    expect(await themeFlag()).toBe("dark")
    expect(await themeFlag.details()).toEqual({
      flagKey: "theme",
      payload,
      source: "provider",
      value: "dark",
    })
  })

  test("passes a declared variant payload through without validation", async () => {
    const payload = { experiment: "checkout-theme", metadata: new Map([["cohort", 4]]) }
    const flag = createFlags({
      decide: () => decision.variant("dark", payload),
      identify: () => ({ distinctId: "user123" }),
    })
    const themeFlag = flag<typeof payload>({
      defaultValue: "light",
      key: "theme",
      variants: ["light", "dark"],
    })

    const details = await themeFlag.details()

    expect(details.payload).toBe(payload)
  })

  test("leaves payload undefined for a variant decision without one", async () => {
    const flag = createFlags({
      decide: () => ({ type: "variant", variant: "dark" }),
      identify: () => ({ distinctId: "user123" }),
    })
    const themeFlag = flag({
      defaultValue: "light",
      key: "theme",
      variants: ["light", "dark"],
    })

    const details = await themeFlag.details()
    expect(details.payload).toBeUndefined()
    expect("payload" in details).toBe(false)
  })

  test("does not expose payloads from rejected variant decisions", async () => {
    const flag = createFlags({
      decide: () => ({ payload: { experiment: "stale" }, type: "variant", variant: "purple" }),
      identify: () => ({ distinctId: "user123" }),
    })
    const themeFlag = flag({
      defaultValue: "light",
      key: "theme",
      variants: ["light", "dark"],
    })

    const details = await themeFlag.details()
    expect(details).toEqual({
      error: expect.any(Error),
      flagKey: "theme",
      source: "default",
      value: "light",
    })
    expect("payload" in details).toBe(false)
  })

  test("falls back with an error for malformed provider decisions", async () => {
    const malformed = [{}, { value: "true" }, { type: "boolean", value: "true" }]

    const details = await Promise.all(
      malformed.map(async (providerDecision) => {
        const flag = createFlags({
          decide: () => providerDecision as unknown as Decision,
          identify: () => ({ distinctId: "user123" }),
        })
        return await flag({ defaultValue: false, key: "beta-access" }).details()
      })
    )

    for (const result of details) {
      expect(result.value).toBe(false)
      expect(result.source).toBe("default")
      expect(result.error).toBeInstanceOf(MalformedDecisionError)
    }
  })

  test("creates boolean flag that evaluates to false", async () => {
    const identity: Identity = { distinctId: "user123" }
    const decision: Decision = { type: "boolean", value: false }

    const flag = createFlags({
      decide: vi.fn(() => Promise.resolve(decision)),
      identify: vi.fn(() => Promise.resolve(identity)),
    })

    const betaFlag = flag({ defaultValue: true, key: "beta-access" })
    const result = await betaFlag()

    expect(result).toBe(false)
  })

  test("creates variant flag with string variants", async () => {
    const identity: Identity = { distinctId: "user123" }
    const decision: Decision = { type: "variant", variant: "dark" }

    const flag = createFlags({
      decide: vi.fn(() => Promise.resolve(decision)),
      identify: vi.fn(() => Promise.resolve(identity)),
    })

    const themeFlag = flag({
      defaultValue: "light",
      key: "theme",
      variants: ["light", "dark", "system"],
    })

    const result = await themeFlag()

    expect(result).toBe("dark")
  })

  test("returns default value when identity not found", async () => {
    const flag = createFlags({
      decide: () => Promise.resolve({ type: "boolean", value: true } as const),
      identify: () => Promise.resolve(null),
    })

    const betaFlag = flag({ defaultValue: false, key: "beta-access" })
    const result = await betaFlag()

    expect(result).toBe(false)
  })

  test("returns default value when decide throws error", async () => {
    const flag = createFlags({
      decide: () => Promise.reject(new Error("Provider error")),
      identify: () => Promise.resolve({ distinctId: "user123" }),
    })

    const betaFlag = flag({ defaultValue: false, key: "beta-access" })
    const result = await betaFlag()

    expect(result).toBe(false)
  })

  test("uses override identity when provided", async () => {
    const defaultIdentity: Identity = { distinctId: "default" }
    const overrideIdentity: Identity = { distinctId: "override" }

    const identifyFn = vi.fn(() => Promise.resolve(defaultIdentity))
    const decideFn = vi.fn((_key: string, identity: Identity) =>
      Promise.resolve({ type: "boolean", value: identity.distinctId === "override" } as const)
    )

    const flag = createFlags({
      decide: decideFn,
      identify: identifyFn,
    })

    const betaFlag = flag({ defaultValue: false, key: "beta-access" })
    const result = await betaFlag({ identity: overrideIdentity })

    expect(result).toBe(true)
    expect(identifyFn).not.toHaveBeenCalled()
    expect(decideFn).toHaveBeenCalledWith(
      "beta-access",
      overrideIdentity,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
  })

  test("passes hooks to flag execution", async () => {
    const beforeFn = vi.fn(() => Promise.resolve())
    const afterFn = vi.fn(() => Promise.resolve())

    const hooks: Hook[] = [{ after: afterFn, before: beforeFn }]

    const flag = createFlags({
      decide: () => Promise.resolve({ type: "boolean", value: true } as const),
      hooks,
      identify: () => Promise.resolve({ distinctId: "user123" }),
    })

    const betaFlag = flag({ defaultValue: false, key: "beta-access" })
    await betaFlag()

    expect(beforeFn).toHaveBeenCalled()
    expect(afterFn).toHaveBeenCalled()
  })

  test("cache can short-circuit evaluation", async () => {
    const cachedDecision: Decision = { type: "boolean", value: true }
    const decideFn = vi.fn(() => Promise.resolve({ type: "boolean", value: false } as const))

    const flag = createFlags({
      cache: {
        get: () => Promise.resolve(cachedDecision),
        set: () => Promise.resolve(),
      },
      decide: decideFn,
      identify: () => Promise.resolve({ distinctId: "user123" }),
    })

    const betaFlag = flag({ defaultValue: false, key: "beta-access" })
    const result = await betaFlag()

    expect(result).toBe(true)
    expect(decideFn).not.toHaveBeenCalled() // Short-circuited
  })

  test("creates several flags from one flag factory", async () => {
    const flag = createFlags({
      decide: (key) => Promise.resolve({ type: "boolean", value: key === "flag1" } as const),
      identify: () => Promise.resolve({ distinctId: "user123" }),
    })

    const flag1 = flag({ defaultValue: false, key: "flag1" })
    const flag2 = flag({ defaultValue: false, key: "flag2" })

    const result1 = await flag1()
    const result2 = await flag2()

    expect(result1).toBe(true)
    expect(result2).toBe(false)
  })

  test("validates variant decision against variants list", async () => {
    const flag = createFlags({
      decide: () => Promise.resolve({ type: "variant", variant: "invalid" } as const),
      identify: () => Promise.resolve({ distinctId: "user123" }),
    })

    const themeFlag = flag({
      defaultValue: "light",
      key: "theme",
      variants: ["light", "dark"],
    })

    const result = await themeFlag()

    // Should return default when validation fails
    expect(result).toBe("light")
  })

  test("accepts valid variant from variants list", async () => {
    const flag = createFlags({
      decide: () => Promise.resolve({ type: "variant", variant: "dark" } as const),
      identify: () => Promise.resolve({ distinctId: "user123" }),
    })

    const themeFlag = flag({
      defaultValue: "light",
      key: "theme",
      variants: ["light", "dark", "system"],
    })

    const result = await themeFlag()

    expect(result).toBe("dark")
  })

  test("works with custom identity type", async () => {
    interface CustomIdentity extends Identity {
      email: string
      plan: "free" | "pro"
    }

    const customIdentity: CustomIdentity = {
      distinctId: "user123",
      email: "user@example.com",
      plan: "pro",
    }

    const flag = createFlags<CustomIdentity>({
      decide: (_key, identity) =>
        Promise.resolve({ type: "boolean", value: identity.plan === "pro" } as const),
      identify: () => Promise.resolve(customIdentity),
    })

    const proFlag = flag({ defaultValue: false, key: "pro-feature" })
    const result = await proFlag()

    expect(result).toBe(true)
  })

  test("error hooks are called on failure", async () => {
    const error = new Error("Test error")
    const errorFn = vi.fn(() => Promise.resolve())

    const hooks: Hook[] = [{ error: errorFn }]

    const flag = createFlags({
      decide: () => Promise.reject(error),
      hooks,
      identify: () => Promise.resolve({ distinctId: "user123" }),
    })

    const betaFlag = flag({ defaultValue: false, key: "beta-access" })
    await betaFlag()

    expect(errorFn).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultValue: false,
        flagKey: "beta-access",
        identity: { distinctId: "user123" },
        kind: "boolean",
        signal: expect.any(AbortSignal),
        variants: undefined,
      }),
      error
    )
  })

  test("finally hooks always run", async () => {
    const finallyFn = vi.fn(() => Promise.resolve())

    const hooks: Hook[] = [{ finally: finallyFn }]

    const flag = createFlags({
      decide: () => Promise.resolve({ type: "boolean", value: true } as const),
      hooks,
      identify: () => Promise.resolve({ distinctId: "user123" }),
    })

    const betaFlag = flag({ defaultValue: false, key: "beta-access" })
    await betaFlag()
    await sleep(0)

    expect(finallyFn).toHaveBeenCalled()
  })

  test("finally hooks run even on error", async () => {
    const finallyFn = vi.fn(() => Promise.resolve())

    const hooks: Hook[] = [{ finally: finallyFn }]

    const flag = createFlags({
      decide: () => Promise.resolve({ type: "boolean", value: true } as const),
      hooks,
      identify: () => Promise.reject(new Error("Identity error")),
    })

    const betaFlag = flag({ defaultValue: false, key: "beta-access" })
    await betaFlag()

    expect(finallyFn).toHaveBeenCalled()
  })

  test("works without hooks configuration", async () => {
    const flag = createFlags({
      decide: () => Promise.resolve({ type: "boolean", value: true } as const),
      identify: () => Promise.resolve({ distinctId: "user123" }),
    })

    const betaFlag = flag({ defaultValue: false, key: "beta-access" })
    const result = await betaFlag()

    expect(result).toBe(true)
  })

  test("works with empty hooks array", async () => {
    const flag = createFlags({
      decide: () => Promise.resolve({ type: "boolean", value: true } as const),
      hooks: [],
      identify: () => Promise.resolve({ distinctId: "user123" }),
    })

    const betaFlag = flag({ defaultValue: false, key: "beta-access" })
    const result = await betaFlag()

    expect(result).toBe(true)
  })

  test("flag function can be called multiple times", async () => {
    let callCount = 0
    const flag = createFlags({
      decide: () => {
        callCount += 1
        return Promise.resolve({ type: "boolean", value: true } as const)
      },
      identify: () => Promise.resolve({ distinctId: "user123" }),
    })

    const betaFlag = flag({ defaultValue: false, key: "beta-access" })

    await betaFlag()
    await betaFlag()
    await betaFlag()

    expect(callCount).toBe(3)
  })

  test("different flags are independent", async () => {
    const identifyFn = vi.fn(() => Promise.resolve({ distinctId: "user123" }))
    const decideFn = vi.fn((_key: string) =>
      Promise.resolve({ type: "boolean", value: true } as const)
    )

    const flag = createFlags({
      decide: decideFn,
      identify: identifyFn,
    })

    const flag1 = flag({ defaultValue: false, key: "flag1" })
    const flag2 = flag({ defaultValue: false, key: "flag2" })

    await flag1()
    await flag2()

    expect(decideFn).toHaveBeenCalledWith("flag1", { distinctId: "user123" }, expect.any(Object))
    expect(decideFn).toHaveBeenCalledWith("flag2", { distinctId: "user123" }, expect.any(Object))
  })

  test("handles numeric distinctId", async () => {
    const identity: Identity = { distinctId: 12_345 }

    const flag = createFlags({
      decide: () => Promise.resolve({ type: "boolean", value: true } as const),
      identify: () => Promise.resolve(identity),
    })

    const betaFlag = flag({ defaultValue: false, key: "beta-access" })
    const result = await betaFlag()

    expect(result).toBe(true)
  })

  test("preserves additional identity properties", async () => {
    interface CustomIdentity extends Identity {
      email: string
      role: string
    }

    const customIdentity: CustomIdentity = {
      distinctId: "user123",
      email: "user@example.com",
      role: "admin",
    }

    const decideFn = vi.fn((_key: string, identity: CustomIdentity) =>
      Promise.resolve({ type: "boolean", value: identity.role === "admin" } as const)
    )

    const flag = createFlags<CustomIdentity>({
      decide: decideFn,
      identify: () => Promise.resolve(customIdentity),
    })

    const adminFlag = flag({ defaultValue: false, key: "admin-feature" })
    const result = await adminFlag()

    expect(result).toBe(true)
    expect(decideFn).toHaveBeenCalledWith("admin-feature", customIdentity, expect.any(Object))
  })
})
