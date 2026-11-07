import { describe, expect, test, vi } from "vitest"
import type { Decision, Hook, Identity, IdentityValue } from "#lib/types/index.ts"
import { createFlags } from "#factory.ts"
import { BatchFlagNotFoundError, FlagTimeoutError } from "#lib/shared/errors.ts"

async function expectRejection(promise: Promise<IdentityValue>, message: string): Promise<void> {
  try {
    await promise
  } catch (error) {
    expect(error).toHaveProperty("message", message)
    return
  }
  throw new Error("Expected batch to reject")
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

describe("flag batches", () => {
  test("returns a destructurable array in flag order", async () => {
    const flag = createFlags({
      decide: (key) =>
        key === "theme"
          ? ({ type: "variant", variant: "dark" } as const)
          : ({ type: "boolean", value: true } as const),
      identify: () => ({ distinctId: "user" }),
    })
    const beta = flag({ defaultValue: false, key: "beta" })
    const theme = flag({ defaultValue: "light", key: "theme", variants: ["light", "dark"] })
    const batch = await flag.batch([beta, theme])
    const [betaValue, themeValue] = batch

    expect(Array.isArray(batch)).toBe(true)
    expect([betaValue, themeValue]).toEqual([batch.get(beta), batch.get(theme)])
    expect(Array.from(batch)).toEqual([true, "dark"])
    expect([...batch]).toEqual([true, "dark"])
  })
  test("runs error hooks for each batch entry that falls back", async () => {
    const reportedFlagKeys: string[] = []
    const flag = createFlags({
      decide: () => Promise.reject(new Error("Provider failed")),
      decideMany: () => Promise.reject(new Error("Batch provider failed")),
      hooks: [
        {
          error: (context) => {
            reportedFlagKeys.push(context.flagKey)
          },
        },
      ],
      identify: () => ({ distinctId: "user123" }),
    })
    const first = flag({ defaultValue: false, key: "first" })
    const second = flag({ defaultValue: true, key: "second" })

    const batch = await flag.batch([first, second])

    expect(batch.get(first)).toBe(false)
    expect(batch.get(second)).toBe(true)
    expect(reportedFlagKeys.toSorted()).toEqual(["first", "second"])
  })

  test("returns an empty batch without resolving identity", async () => {
    const identify = vi.fn(() => ({ distinctId: "user123" }))
    const flag = createFlags({
      decide: () => ({ type: "boolean", value: true }),
      identify,
    })
    const betaAccess = flag({ defaultValue: false, key: "beta-access" })

    const batch = await flag.batch([])

    expect(identify).not.toHaveBeenCalled()
    // @ts-expect-error -- An empty batch cannot contain this evaluator.
    expect(() => batch.get(betaAccess)).toThrow(BatchFlagNotFoundError)
  })

  test("returns partial fallback results when identity resolution fails", async () => {
    const identityError = new Error("identity unavailable")
    const decide = vi.fn(() => ({ type: "boolean", value: true }) as const)
    const decideMany = vi.fn(() => ({ first: { type: "boolean", value: true } as const }))
    const flag = createFlags({
      decide,
      decideMany,
      identify: () => Promise.reject(identityError),
    })
    const first = flag({ defaultValue: false, key: "first" })
    const second = flag({ defaultValue: true, key: "second" })

    const batch = await flag.batch([first, second])

    expect(batch.get(first)).toBe(false)
    expect(batch.get(second)).toBe(true)
    expect(batch.details(first).error).toBe(identityError)
    expect(batch.details(second).error).toBe(identityError)
    expect(decideMany).not.toHaveBeenCalled()
    expect(decide).not.toHaveBeenCalled()
  })

  test("commits a batch before detached after hooks settle", async () => {
    let releaseAfter!: () => void
    const afterWork = new Promise<void>((resolve) => {
      releaseAfter = resolve
    })
    const after = vi.fn(async () => {
      await afterWork
    })
    const flag = createFlags({
      decide: () => ({ type: "boolean", value: true }),
      decideMany: () => ({ "beta-access": { type: "boolean", value: true } }),
      hooks: [{ after }],
      identify: () => ({ distinctId: "user123" }),
    })
    const betaAccess = flag({ defaultValue: false, key: "beta-access" })

    const batch = await Promise.race([
      flag.batch([betaAccess]),
      delay(50).then(() => {
        throw new Error("Batch waited for an after hook")
      }),
    ])

    expect(batch.get(betaAccess)).toBe(true)
    expect(after).toHaveBeenCalledTimes(1)
    releaseAfter()
  })

  test("resolves identity once and batches unresolved flags", async () => {
    const identity = { distinctId: "user123" }
    const identify = vi.fn(() => identity)
    const decide = vi.fn(() => {
      throw new Error("single decision should not run")
    })
    const decideMany = vi.fn(() => ({
      "beta-access": { type: "boolean", value: true } as const,
      theme: { type: "variant", variant: "dark" } as const,
    }))
    const flag = createFlags({ decide, decideMany, identify })
    const betaAccess = flag({ defaultValue: false, key: "beta-access" })
    const theme = flag({
      defaultValue: "light",
      key: "theme",
      variants: ["light", "dark"],
    })

    const batch = await flag.batch([betaAccess, theme] as const)
    const booleanValue: boolean = batch.get(betaAccess)
    const variantValue: "light" | "dark" = batch.get(theme)

    expect(booleanValue).toBe(true)
    expect(variantValue).toBe("dark")
    expect(identify).toHaveBeenCalledTimes(1)
    expect(decideMany).toHaveBeenCalledWith(["beta-access", "theme"], identity, expect.any(Object))
    expect(decide).not.toHaveBeenCalled()
  })

  test("exposes typed evaluation details and variant payloads", async () => {
    const flag = createFlags({
      decide: () => ({ type: "boolean", value: false }),
      decideMany: () => ({
        broken: { type: "variant", variant: "invalid" },
        theme: { payload: { campaign: "summer" }, type: "variant", variant: "dark" },
      }),
      identify: () => ({ distinctId: "user123" }),
    })
    const theme = flag({
      defaultValue: "light",
      key: "theme",
      variants: ["light", "dark"],
    })
    const broken = flag({ defaultValue: false, key: "broken" })

    const batch = await flag.batch([theme, broken] as const)
    const themeDetails = batch.details(theme)
    const brokenDetails = batch.details(broken)

    expect(themeDetails).toEqual({
      flagKey: "theme",
      payload: { campaign: "summer" },
      source: "provider",
      value: "dark",
    })
    expect(brokenDetails.source).toBe("default")
    expect(brokenDetails.value).toBe(false)
    expect(brokenDetails.error).toBeInstanceOf(Error)
  })

  test("sends only cache misses to decideMany and runs every observer lifecycle", async () => {
    const phases: string[] = []
    const hook: Hook = {
      after: (context) => {
        phases.push(`${context.flagKey}:after`)
      },
      before: (context) => {
        phases.push(`${context.flagKey}:before`)
      },
      finally: (context) => {
        phases.push(`${context.flagKey}:finally`)
      },
    }
    const stored = new Map<string, Decision>([
      ['["beta-access","boolean",null,"string","user123"]', { type: "boolean", value: true }],
    ])
    const decideMany = vi.fn(() => ({
      theme: { type: "variant", variant: "dark" } as const,
    }))
    const flag = createFlags({
      cache: {
        get: (key) => Promise.resolve(stored.get(key)),
        set: (key, value) => {
          stored.set(key, value)
          return Promise.resolve()
        },
      },
      decide: () => ({ type: "boolean", value: false }),
      decideMany,
      hooks: [hook],
      identify: () => ({ distinctId: "user123" }),
    })
    const betaAccess = flag({ defaultValue: false, key: "beta-access" })
    const theme = flag({
      defaultValue: "light",
      key: "theme",
      variants: ["light", "dark"],
    })

    const batch = await flag.batch([betaAccess, theme])

    expect(batch.get(betaAccess)).toBe(true)
    expect(batch.get(theme)).toBe("dark")
    expect(decideMany).toHaveBeenCalledWith(["theme"], expect.any(Object), expect.any(Object))
    expect(phases.filter((phase) => phase.startsWith("beta-access:"))).toEqual([
      "beta-access:before",
      "beta-access:after",
      "beta-access:finally",
    ])
    expect(phases.filter((phase) => phase.startsWith("theme:"))).toEqual([
      "theme:before",
      "theme:after",
      "theme:finally",
    ])
  })

  test("isolates an invalid decision to its flag", async () => {
    const flag = createFlags({
      decide: () => ({ type: "boolean", value: false }),
      decideMany: () => ({
        "beta-access": { type: "boolean", value: true },
        theme: { type: "variant", variant: "purple" },
      }),
      identify: () => ({ distinctId: "user123" }),
    })
    const betaAccess = flag({ defaultValue: false, key: "beta-access" })
    const theme = flag({
      defaultValue: "light",
      key: "theme",
      variants: ["light", "dark"],
    })

    const batch = await flag.batch([betaAccess, theme])

    expect(batch.get(betaAccess)).toBe(true)
    expect(batch.get(theme)).toBe("light")
  })

  test("isolates a rejected batch while preserving cached flags", async () => {
    const flag = createFlags({
      cache: {
        get: (key) =>
          Promise.resolve(
            key.includes("hooked") ? { type: "boolean" as const, value: true } : undefined
          ),
        set: () => Promise.resolve(),
      },
      decide: () => ({ type: "boolean", value: true }),
      decideMany: () => Promise.reject(new Error("provider unavailable")),
      identify: () => ({ distinctId: "user123" }),
    })
    const hooked = flag({ defaultValue: false, key: "hooked" })
    const unresolved = flag({ defaultValue: false, key: "unresolved" })

    const batch = await flag.batch([hooked, unresolved])

    expect(batch.get(hooked)).toBe(true)
    expect(batch.get(unresolved)).toBe(false)
  })

  test("falls back to one single decision for a missing batch key", async () => {
    const decide = vi.fn((key: string) =>
      key === "theme"
        ? ({ type: "variant", variant: "dark" } as const)
        : ({ type: "boolean", value: false } as const)
    )
    const flag = createFlags({
      decide,
      decideMany: () => ({ "beta-access": { type: "boolean", value: true } }),
      identify: () => ({ distinctId: "user123" }),
    })
    const betaAccess = flag({ defaultValue: false, key: "beta-access" })
    const theme = flag({
      defaultValue: "light",
      key: "theme",
      variants: ["light", "dark"],
    })

    const batch = await flag.batch([betaAccess, theme])

    expect(batch.get(betaAccess)).toBe(true)
    expect(batch.get(theme)).toBe("dark")
    expect(decide).toHaveBeenCalledTimes(1)
    expect(decide).toHaveBeenCalledWith("theme", expect.any(Object), expect.any(Object))
  })

  test("does not treat inherited record properties as batch decisions", async () => {
    const decide = vi.fn(() => ({ type: "boolean", value: true }) as const)
    const flag = createFlags({
      decide,
      decideMany: () => ({}),
      identify: () => ({ distinctId: "user123" }),
    })
    const inheritedKey = flag({ defaultValue: false, key: "toString" })

    const batch = await flag.batch([inheritedKey])

    expect(batch.get(inheritedKey)).toBe(true)
    expect(decide).toHaveBeenCalledTimes(1)
  })

  test("uses parallel single decisions when decideMany is absent", async () => {
    const decide = vi.fn((key: string): Decision =>
      key === "theme" ? { type: "variant", variant: "dark" } : { type: "boolean", value: true }
    )
    const flag = createFlags({
      decide,
      identify: () => ({ distinctId: "user123" }),
    })
    const betaAccess = flag({ defaultValue: false, key: "beta-access" })
    const theme = flag({
      defaultValue: "light",
      key: "theme",
      variants: ["light", "dark"],
    })

    const batch = await flag.batch([betaAccess, theme])

    expect(batch.get(betaAccess)).toBe(true)
    expect(batch.get(theme)).toBe("dark")
    expect(decide).toHaveBeenCalledTimes(2)
  })

  test("integrates with cache and core coalescing without hanging", async () => {
    const stored = new Map<string, Decision>([
      [
        '["beta-access","boolean",null,"string","user123"]',
        {
          type: "boolean",
          value: true,
        },
      ],
    ])
    const cache = {
      get: vi.fn((key: string) => Promise.resolve(stored.get(key))),
      set: vi.fn((key: string, value: Decision) => {
        stored.set(key, value)
        return Promise.resolve()
      }),
    }
    const decide = vi.fn(() => ({ type: "variant", variant: "dark" }) as const)
    const decideMany = vi.fn(() => ({
      theme: { type: "variant", variant: "dark" } as const,
    }))
    const flag = createFlags({
      cache,
      coalesce: true,
      decide,
      decideMany,
      identify: () => ({ distinctId: "user123" }),
    })
    const betaAccess = flag({ defaultValue: false, key: "beta-access" })
    const theme = flag({
      defaultValue: "light",
      key: "theme",
      variants: ["light", "dark"],
    })

    const batch = await flag.batch([betaAccess, theme])

    expect(batch.get(betaAccess)).toBe(true)
    expect(batch.get(theme)).toBe("dark")
    expect(decideMany).toHaveBeenCalledWith(["theme"], expect.any(Object), expect.any(Object))
    expect(cache.set).toHaveBeenCalledWith(
      '["theme","variant",["light","dark"],"string","user123"]',
      {
        type: "variant",
        variant: "dark",
      }
    )
  })

  test("does not deadlock concurrent batches with cross-key coalescing leaders", async () => {
    const invocationCount = new Map<string, number>()
    const dispatchedKeys = new Set<string>()
    let releaseBatches!: () => void
    const bothLeadersDispatched = new Promise<void>((resolve) => {
      releaseBatches = resolve
    })
    const skewedHook: Hook = {
      async before(context) {
        const count = (invocationCount.get(context.flagKey) ?? 0) + 1
        invocationCount.set(context.flagKey, count)
        if (
          (context.flagKey === "first" && count === 2)
          || (context.flagKey === "second" && count === 1)
        ) {
          await delay(20)
        }
      },
    }
    const decideMany = vi.fn(async (keys: readonly string[]) => {
      for (const key of keys) {
        dispatchedKeys.add(key)
      }
      if (dispatchedKeys.size === 2) {
        releaseBatches()
      }
      await bothLeadersDispatched
      await delay(40)
      return Object.fromEntries(keys.map((key) => [key, { type: "boolean", value: true } as const]))
    })
    const flag = createFlags({
      coalesce: true,
      decide: () => ({ type: "boolean", value: true }),
      decideMany,
      hooks: [skewedHook],
      identify: () => ({ distinctId: "user123" }),
      timeoutMs: 200,
    })
    const first = flag({ defaultValue: false, key: "first" })
    const second = flag({ defaultValue: false, key: "second" })

    const [firstBatch, secondBatch] = await Promise.all([
      flag.batch([first, second]),
      flag.batch([first, second]),
    ])

    expect(firstBatch.get(first)).toBe(true)
    expect(firstBatch.get(second)).toBe(true)
    expect(secondBatch.get(first)).toBe(true)
    expect(secondBatch.get(second)).toBe(true)
    expect(decideMany).toHaveBeenCalledTimes(2)
  })

  test("shares one caller abort signal across hooks and cancels the batch on exit", async () => {
    const hookSignals: AbortSignal[] = []
    let batchSignal: AbortSignal | undefined
    let batchAbortedDuringCall: boolean | undefined
    const controller = new AbortController()
    const flag = createFlags({
      decide: () => ({ type: "boolean", value: false }),
      decideMany: (keys, identity, options) => {
        void keys
        void identity
        batchSignal = options?.signal
        batchAbortedDuringCall = options?.signal?.aborted
        return {
          first: { type: "boolean", value: true },
          second: { type: "boolean", value: true },
        }
      },
      hooks: [
        {
          before: (context) => {
            hookSignals.push(context.signal)
          },
        },
      ],
      identify: () => ({ distinctId: "user123" }),
    })
    const first = flag({ defaultValue: false, key: "first" })
    const second = flag({ defaultValue: false, key: "second" })

    await flag.batch([first, second], { signal: controller.signal })

    expect(hookSignals).toHaveLength(2)
    expect(hookSignals[0]).toBe(controller.signal)
    expect(hookSignals[1]).toBe(controller.signal)
    expect(batchAbortedDuringCall).toBe(false)
    expect(batchSignal?.aborted).toBe(true)
  })

  test("preserves a per-flag timeout that is longer than the factory default", async () => {
    const flag = createFlags({
      decide: async () => {
        await delay(40)
        return { type: "boolean", value: true }
      },
      identify: () => ({ distinctId: "user123" }),
      timeoutMs: 10,
    })
    const factoryTimed = flag({ defaultValue: false, key: "factory-timed" })
    const slow = flag({ defaultValue: false, key: "slow", timeoutMs: 100 })

    const batch = await flag.batch([factoryTimed, slow])

    expect(batch.get(factoryTimed)).toBe(false)
    expect(batch.details(factoryTimed).source).toBe("default")
    expect(batch.get(slow)).toBe(true)
    expect(batch.details(slow).source).toBe("provider")
  })

  test("gives the single-decision fallback the flag's own deadline", async () => {
    const signals: Record<string, AbortSignal | undefined> = {}
    const flag = createFlags({
      decide: async (key, _identity, options) => {
        signals[key] = options?.signal
        await delay(200)
        return { type: "boolean", value: true }
      },
      identify: () => ({ distinctId: "user123" }),
    })
    const capped = flag({ defaultValue: false, key: "capped", timeoutMs: 20 })
    const unbounded = flag({ defaultValue: false, key: "unbounded" })

    await flag.batch([capped, unbounded])

    expect(signals.capped?.aborted).toBe(true)
    expect(signals.unbounded?.aborted).toBe(false)
  })

  test("stops a flag's signal from aborting once that flag has settled", async () => {
    const signals: Record<string, AbortSignal> = {}
    const flag = createFlags({
      decide: async (key) => {
        await delay(key === "fast" ? 5 : 150)
        return { type: "boolean", value: true }
      },
      hooks: [
        {
          before: (context) => {
            signals[context.flagKey] = context.signal
          },
        },
      ],
      identify: () => ({ distinctId: "user123" }),
    })
    const fast = flag({ defaultValue: false, key: "fast", timeoutMs: 50 })
    const slow = flag({ defaultValue: false, key: "slow", timeoutMs: 5000 })

    const batch = await flag.batch([fast, slow])

    expect(batch.get(fast)).toBe(true)
    expect(signals.fast?.aborted).toBe(false)
  })

  test("passes null identity to anonymous batches without deduplicating batches", async () => {
    const decideMany = vi.fn((keys: readonly string[], identity: Identity | null) => {
      expect(identity).toBeNull()
      return Object.fromEntries(keys.map((key) => [key, { type: "boolean", value: true } as const]))
    })
    const flag = createFlags({
      anonymous: "allow",
      coalesce: true,
      decide: () => ({ type: "boolean", value: false }),
      decideMany,
      identify: () => null,
    })
    const anonymous = flag({ defaultValue: false, key: "anonymous" })

    const [first, second] = await Promise.all([flag.batch([anonymous]), flag.batch([anonymous])])

    expect(first.get(anonymous)).toBe(true)
    expect(second.get(anonymous)).toBe(true)
    expect(decideMany).toHaveBeenCalledTimes(2)
  })

  test("forces an anonymous identity for one batch", async () => {
    const identify = vi.fn(() => ({ distinctId: "identified" }))
    const decideMany = vi.fn((keys: readonly string[], identity: Identity | null) => {
      expect(identity).toBeNull()
      return Object.fromEntries(keys.map((key) => [key, { type: "boolean", value: true } as const]))
    })
    const flag = createFlags({
      anonymous: "allow",
      decide: () => ({ type: "boolean", value: false }),
      decideMany,
      identify,
    })
    const anonymous = flag({ defaultValue: false, key: "anonymous" })

    const batch = await flag.batch([anonymous], { identity: null })

    expect(batch.get(anonymous)).toBe(true)
    expect(identify).not.toHaveBeenCalled()
    expect(decideMany).toHaveBeenCalledWith(["anonymous"], null, expect.any(Object))
  })

  test("rejects duplicate keys before identity or provider work", async () => {
    const identify = vi.fn(() => ({ distinctId: "user123" }))
    const decide = vi.fn(() => ({ type: "boolean", value: true }) as const)
    const flag = createFlags({ decide, identify })
    const first = flag({ defaultValue: false, key: "duplicate" })
    const second = flag({ defaultValue: true, key: "duplicate" })

    await expectRejection(
      flag.batch([first, second]),
      "Batch requires unique flag keys; duplicate: duplicate"
    )
    expect(identify).not.toHaveBeenCalled()
    expect(decide).not.toHaveBeenCalled()
  })

  test("rejects evaluators from another factory built on the same config", async () => {
    const config = {
      decide: () => ({ type: "boolean", value: true }) as const,
      identify: () => ({ distinctId: "user123" }),
    }
    const firstFlag = createFlags(config)
    const secondFlag = createFlags(config)
    const own = firstFlag({ defaultValue: false, key: "own" })
    const foreign = secondFlag({ defaultValue: false, key: "foreign" })

    await expectRejection(
      firstFlag.batch([own, foreign]),
      "Batch flags must be created by this flag factory"
    )
  })

  test("does not join a flush round whose entries all timed out before the flush", async () => {
    vi.useFakeTimers()
    try {
      const decideMany = vi.fn((keys: readonly string[]) =>
        Object.fromEntries(keys.map((key) => [key, { type: "boolean", value: true } as const]))
      )
      // Fake timers that are due at one time run in creation order, with microtasks between them.
      // Every timer below is due at 1 ms, and they run in this order:
      // 1. `identified` resolves the identity. `slow` starts its wait, and `fast` opens round A.
      // 2. The `fast` timeout aborts every entry of round A before round A flushes.
      // 3. `slow` wakes and needs provider work while round A is still open.
      // 4. Round A flushes.
      // 5. `late` wakes and needs provider work. It must join the round that `slow` joined.
      const identified = new Promise<void>((resolve) => {
        setTimeout(resolve, 1)
      })
      const lateReady = Promise.withResolvers<null>()
      const flag = createFlags({
        decide: () => ({ type: "boolean", value: false }),
        decideMany,
        // The `slow` key read comes just before `slow` needs provider work, so this timer comes
        // after the round A flush timer and before any timer that `slow` starts.
        evaluationKey: (context) => {
          if (context.flagKey === "slow") {
            setTimeout(() => {
              lateReady.resolve(null)
            }, 0)
          }
          return context.flagKey
        },
        hooks: [
          {
            before: async (context) => {
              if (context.flagKey === "slow") {
                await new Promise((resolve) => {
                  setTimeout(resolve, 0)
                })
              }
              if (context.flagKey === "late") {
                await lateReady.promise
              }
            },
          },
        ],
        identify: async () => {
          await identified
          return { distinctId: "user123" }
        },
      })
      const fast = flag({ defaultValue: false, key: "fast", timeoutMs: 1 })
      const slow = flag({ defaultValue: false, key: "slow", timeoutMs: 1000 })
      const late = flag({ defaultValue: false, key: "late", timeoutMs: 1000 })

      const pending = flag.batch([fast, slow, late])
      await vi.advanceTimersByTimeAsync(10)
      const batch = await pending

      expect(batch.details(fast)).toMatchObject({ source: "default", value: false })
      expect(batch.details(fast).error).toBeInstanceOf(FlagTimeoutError)
      expect(batch.details(slow)).toEqual({ flagKey: "slow", source: "provider", value: true })
      expect(batch.details(late)).toEqual({ flagKey: "late", source: "provider", value: true })
      expect(decideMany).toHaveBeenCalledTimes(1)
      expect(decideMany.mock.calls[0]?.[0]).toEqual(["slow", "late"])
    } finally {
      vi.useRealTimers()
    }
  })
})
