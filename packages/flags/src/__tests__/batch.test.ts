import { describe, expect, test, vi } from "vitest"
import type { Decision, Flag, Hook, Identity } from "#index.ts"
import {
  anonymous,
  createFlags,
  decision,
  defineProvider,
  EvaluationTimeoutError,
  flag,
  IdentityNotFoundError,
  InvalidDecisionError,
  ProviderFailedError,
} from "#index.ts"

const user: Identity = { distinctId: "user123" }

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

function decideFor(item: Flag): Decision {
  return item.kind === "variant" ? decision.variant("dark") : decision.boolean(true)
}

function decideAll(flags: readonly Flag[]): Record<string, Decision> {
  return Object.fromEntries(flags.map((item) => [item.key, decideFor(item)]))
}

function decideOneFor(item: Flag): Decision {
  return item.key === "broken" ? decision.variant("zzz") : decideFor(item)
}

const keysOf = (flags: readonly Flag[]) => flags.map((item) => item.key)

describe("batches", () => {
  test("returns the values as a tuple in flag order", async () => {
    const flags = createFlags({
      identify: () => user,
      provider: defineProvider({ decide: decideAll, name: "bulk" }),
    })
    const beta = flag.boolean("beta", false)
    const theme = flag.variant("theme", ["light", "dark"], "light")
    const layout = flag.variant("layout", ["grid", "list"], "grid")

    const values = await flags.getMany([theme, beta, layout])

    expect(Array.isArray(values)).toBe(true)
    expect(values).toEqual(["dark", true, "grid"])
    const [first, second] = await flags.getMany([beta, theme])
    expect([first, second]).toEqual([true, "dark"])
  })

  test("a decideOne provider and a decide provider give the same results", async () => {
    const beta = flag.boolean("beta", false)
    const theme = flag.variant("theme", ["light", "dark"], "light")
    const broken = flag.variant("broken", ["a", "b"], "a")
    const one = createFlags({
      identify: () => user,
      provider: defineProvider({ decideOne: decideOneFor, name: "one" }),
    })
    const many = createFlags({
      identify: () => user,
      provider: defineProvider({
        decide: (items) => Object.fromEntries(items.map((item) => [item.key, decideOneFor(item)])),
        name: "many",
      }),
    })

    const [fromOne, fromMany] = await Promise.all([
      one.detailsMany([beta, theme, broken]),
      many.detailsMany([beta, theme, broken]),
    ])

    expect(fromOne).toEqual(fromMany)
    expect(fromOne.map((details) => details.value)).toEqual([true, "dark", "a"])
    expect(fromOne[2].error).toBeInstanceOf(InvalidDecisionError)
  })

  test("two flags with one key share one provider request", async () => {
    const decide = vi.fn(decideAll)
    const decideOne = vi.fn(decideFor)
    const short = flag.boolean("beta", false)
    const long = flag.boolean("beta", true, { timeout: 1000 })

    const bulk = createFlags({
      cache: { coalesce: false },
      identify: () => user,
      provider: defineProvider({ decide, name: "bulk" }),
    })
    const single = createFlags({
      cache: { coalesce: false },
      identify: () => user,
      provider: defineProvider({ decideOne, name: "single" }),
    })

    expect(await bulk.getMany([short, long, short])).toEqual([true, true, true])
    expect(await single.getMany([short, long])).toEqual([true, true])
    expect(decide).toHaveBeenCalledTimes(1)
    expect(keysOf(decide.mock.calls[0]?.[0] ?? [])).toEqual(["beta"])
    expect(decideOne).toHaveBeenCalledTimes(1)
  })

  test("validates a shared decision against each flag", async () => {
    const asBoolean = flag.boolean("shared", false)
    const asVariant = flag.variant("shared", ["on", "off"], "off")
    const flags = createFlags({
      identify: () => user,
      provider: defineProvider({
        decide: () => ({ shared: decision.boolean(true) }),
        name: "bulk",
      }),
    })

    const [booleanDetails, variantDetails] = await flags.detailsMany([asBoolean, asVariant])

    expect(booleanDetails).toEqual({ flagKey: "shared", source: "provider", value: true })
    expect(variantDetails.value).toBe("off")
    expect(variantDetails.error).toBeInstanceOf(InvalidDecisionError)
  })

  test("runs error hooks for each batch entry that falls back", async () => {
    const reportedFlagKeys: string[] = []
    const flags = createFlags({
      hooks: [
        {
          error: (context) => {
            reportedFlagKeys.push(context.flag.key)
          },
        },
      ],
      identify: () => user,
      provider: defineProvider({
        decide: () => Promise.reject(new Error("Batch provider failed")),
        name: "bulk",
      }),
    })
    const first = flag.boolean("first", false)
    const second = flag.boolean("second", true)

    const [firstDetails, secondDetails] = await flags.detailsMany([first, second])

    expect(firstDetails.value).toBe(false)
    expect(secondDetails.value).toBe(true)
    expect(firstDetails.error).toBeInstanceOf(ProviderFailedError)
    expect(firstDetails.error).toHaveProperty("provider", "bulk")
    expect(reportedFlagKeys.toSorted()).toEqual(["first", "second"])
  })

  test("returns an empty batch without resolving identity", async () => {
    const identify = vi.fn(() => user)
    const flags = createFlags({
      identify,
      provider: defineProvider({ decide: decideAll, name: "bulk" }),
    })

    expect(await flags.getMany([])).toEqual([])
    expect(await flags.detailsMany([])).toEqual([])
    expect(identify).not.toHaveBeenCalled()
  })

  test("returns fallback results when identity resolution fails", async () => {
    const identityError = new Error("identity unavailable")
    const decide = vi.fn(decideAll)
    const flags = createFlags({
      identify: () => Promise.reject(identityError),
      provider: defineProvider({ decide, name: "bulk" }),
    })
    const first = flag.boolean("first", false)
    const second = flag.boolean("second", true)

    const [firstDetails, secondDetails] = await flags.detailsMany([first, second])

    expect(firstDetails.value).toBe(false)
    expect(secondDetails.value).toBe(true)
    expect(firstDetails.error).toBeInstanceOf(IdentityNotFoundError)
    expect(firstDetails.error?.cause).toBe(identityError)
    expect(secondDetails.error).toBe(firstDetails.error)
    expect(decide).not.toHaveBeenCalled()
  })

  test("resolves the batch before detached after hooks settle", async () => {
    let releaseAfter!: () => void
    const afterWork = new Promise<void>((resolve) => {
      releaseAfter = resolve
    })
    const after = vi.fn(async () => {
      await afterWork
    })
    const flags = createFlags({
      hooks: [{ after }],
      identify: () => user,
      provider: defineProvider({ decide: decideAll, name: "bulk" }),
    })
    const betaAccess = flag.boolean("beta-access", false)

    const values = await Promise.race([
      flags.getMany([betaAccess]),
      delay(50).then(() => {
        throw new Error("Batch waited for an after hook")
      }),
    ])

    expect(values).toEqual([true])
    expect(after).toHaveBeenCalledTimes(1)
    releaseAfter()
  })

  test("resolves identity once and sends the unresolved flags in one request", async () => {
    const identify = vi.fn(() => user)
    const decide = vi.fn(decideAll)
    const flags = createFlags({ identify, provider: defineProvider({ decide, name: "bulk" }) })
    const betaAccess = flag.boolean("beta-access", false)
    const theme = flag.variant("theme", ["light", "dark"], "light")

    expect(await flags.getMany([betaAccess, theme])).toEqual([true, "dark"])
    expect(identify).toHaveBeenCalledTimes(1)
    expect(decide).toHaveBeenCalledTimes(1)
    expect(decide).toHaveBeenCalledWith([betaAccess, theme], user, {
      signal: expect.any(AbortSignal),
    })
  })

  test("returns typed details with payloads", async () => {
    const flags = createFlags({
      identify: () => user,
      provider: defineProvider({
        decide: () => ({
          broken: decision.variant("invalid"),
          theme: decision.variant("dark", { campaign: "summer" }),
        }),
        name: "bulk",
      }),
    })
    const theme = flag.variant("theme", ["light", "dark"], "light")
    const broken = flag.boolean("broken", false)

    const [themeDetails, brokenDetails] = await flags.detailsMany([theme, broken])

    expect(themeDetails).toEqual({
      flagKey: "theme",
      payload: { campaign: "summer" },
      source: "provider",
      value: "dark",
    })
    expect(brokenDetails.source).toBe("default")
    expect(brokenDetails.value).toBe(false)
    expect(brokenDetails.error).toBeInstanceOf(InvalidDecisionError)
  })

  test("sends only store misses to the provider and runs every hook phase", async () => {
    const phases: string[] = []
    const hook: Hook = {
      after: (context) => {
        phases.push(`${context.flag.key}:after`)
      },
      before: (context) => {
        phases.push(`${context.flag.key}:before`)
      },
      finally: (context) => {
        phases.push(`${context.flag.key}:finally`)
      },
    }
    const stored = new Map<string, Decision>([
      ['["beta-access","boolean",null,"string","user123"]', decision.boolean(true)],
    ])
    const decide = vi.fn(decideAll)
    const flags = createFlags({
      cache: {
        store: {
          get: (key) => Promise.resolve(stored.get(key)),
          set: (key, value) => {
            stored.set(key, value)
            return Promise.resolve()
          },
        },
      },
      hooks: [hook],
      identify: () => user,
      provider: defineProvider({ decide, name: "bulk" }),
    })
    const betaAccess = flag.boolean("beta-access", false)
    const theme = flag.variant("theme", ["light", "dark"], "light")

    const [betaDetails, themeDetails] = await flags.detailsMany([betaAccess, theme])
    await delay(0)

    expect(betaDetails).toEqual({ flagKey: "beta-access", source: "cache", value: true })
    expect(themeDetails.value).toBe("dark")
    expect(keysOf(decide.mock.calls[0]?.[0] ?? [])).toEqual(["theme"])
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
    const flags = createFlags({
      identify: () => user,
      provider: defineProvider({
        decide: () => ({
          "beta-access": decision.boolean(true),
          theme: decision.variant("purple"),
        }),
        name: "bulk",
      }),
    })

    expect(
      await flags.getMany([
        flag.boolean("beta-access", false),
        flag.variant("theme", ["light", "dark"], "light"),
      ])
    ).toEqual([true, "light"])
  })

  test("isolates a rejected request while keeping stored flags", async () => {
    const flags = createFlags({
      cache: {
        store: {
          get: (key) =>
            Promise.resolve(key.includes("hooked") ? decision.boolean(true) : undefined),
          set: () => Promise.resolve(),
        },
      },
      identify: () => user,
      provider: defineProvider({
        decide: () => Promise.reject(new Error("provider unavailable")),
        name: "bulk",
      }),
    })

    expect(
      await flags.getMany([flag.boolean("hooked", false), flag.boolean("unresolved", false)])
    ).toEqual([true, false])
  })

  test("falls back with InvalidDecisionError for a key missing from the result", async () => {
    const decide = vi.fn(() => ({ "beta-access": decision.boolean(true) }))
    const flags = createFlags({
      identify: () => user,
      provider: defineProvider({ decide, name: "bulk" }),
    })
    const betaAccess = flag.boolean("beta-access", false)
    const theme = flag.variant("theme", ["light", "dark"], "light")

    const [betaDetails, themeDetails] = await flags.detailsMany([betaAccess, theme])

    expect(betaDetails.value).toBe(true)
    expect(themeDetails.value).toBe("light")
    expect(themeDetails.error).toBeInstanceOf(InvalidDecisionError)
    expect(decide).toHaveBeenCalledTimes(1)
  })

  test("does not treat inherited record properties as decisions", async () => {
    const flags = createFlags({
      identify: () => user,
      provider: defineProvider({ decide: () => ({}), name: "bulk" }),
    })

    const [details] = await flags.detailsMany([flag.boolean("toString", false)])
    expect(details.error).toBeInstanceOf(InvalidDecisionError)
  })

  test("calls decideOne for each flag of a decideOne provider", async () => {
    const decideOne = vi.fn(decideFor)
    const flags = createFlags({
      identify: () => user,
      provider: defineProvider({ decideOne, name: "single" }),
    })

    expect(
      await flags.getMany([
        flag.boolean("beta-access", false),
        flag.variant("theme", ["light", "dark"], "light"),
      ])
    ).toEqual([true, "dark"])
    expect(decideOne).toHaveBeenCalledTimes(2)
  })

  test("isolates a failing decideOne call to its flag", async () => {
    const flags = createFlags({
      identify: () => user,
      provider: defineProvider({
        decideOne: (item) => {
          if (item.key === "bad") throw new Error("bad flag")
          return decideFor(item)
        },
        name: "single",
      }),
    })

    const [good, bad] = await flags.detailsMany([
      flag.boolean("good", false),
      flag.boolean("bad", false),
    ])
    expect(good.value).toBe(true)
    expect(bad.error).toBeInstanceOf(ProviderFailedError)
  })

  test("integrates with the store and coalescing without hanging", async () => {
    const stored = new Map<string, Decision>([
      ['["beta-access","boolean",null,"string","user123"]', decision.boolean(true)],
    ])
    const store = {
      get: vi.fn((key: string) => Promise.resolve(stored.get(key))),
      set: vi.fn((key: string, value: Decision) => {
        stored.set(key, value)
        return Promise.resolve()
      }),
    }
    const decide = vi.fn(decideAll)
    const flags = createFlags({
      cache: { coalesce: true, store },
      identify: () => user,
      provider: defineProvider({ decide, name: "bulk" }),
    })

    expect(
      await flags.getMany([
        flag.boolean("beta-access", false),
        flag.variant("theme", ["light", "dark"], "light"),
      ])
    ).toEqual([true, "dark"])
    await delay(0)
    expect(keysOf(decide.mock.calls[0]?.[0] ?? [])).toEqual(["theme"])
    expect(store.set).toHaveBeenCalledWith(
      '["theme","variant",["light","dark"],"string","user123"]',
      { type: "variant", variant: "dark" }
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
        const key = context.flag.key
        const count = (invocationCount.get(key) ?? 0) + 1
        invocationCount.set(key, count)
        if ((key === "first" && count === 2) || (key === "second" && count === 1)) {
          await delay(20)
        }
      },
    }
    const decide = vi.fn(async (items: readonly Flag[]) => {
      for (const item of items) {
        dispatchedKeys.add(item.key)
      }
      if (dispatchedKeys.size === 2) {
        releaseBatches()
      }
      await bothLeadersDispatched
      await delay(40)
      return decideAll(items)
    })
    const flags = createFlags({
      cache: { coalesce: true },
      hooks: [skewedHook],
      identify: () => user,
      provider: defineProvider({ decide, name: "bulk" }),
      timeout: 200,
    })
    const first = flag.boolean("first", false)
    const second = flag.boolean("second", false)

    const [firstBatch, secondBatch] = await Promise.all([
      flags.getMany([first, second]),
      flags.getMany([first, second]),
    ])

    expect(firstBatch).toEqual([true, true])
    expect(secondBatch).toEqual([true, true])
    expect(decide).toHaveBeenCalledTimes(2)
  })

  test("shares one caller signal across hooks and aborts the request signal on exit", async () => {
    const hookSignals: AbortSignal[] = []
    let requestSignal: AbortSignal | undefined
    let abortedDuringCall: boolean | undefined
    const controller = new AbortController()
    const flags = createFlags({
      hooks: [
        {
          before: (context) => {
            hookSignals.push(context.signal)
          },
        },
      ],
      identify: () => user,
      provider: defineProvider({
        decide: (items, _identity, { signal }) => {
          requestSignal = signal
          abortedDuringCall = signal.aborted
          return decideAll(items)
        },
        name: "bulk",
      }),
    })

    await flags.getMany([flag.boolean("first", false), flag.boolean("second", false)], {
      signal: controller.signal,
    })

    expect(hookSignals).toHaveLength(2)
    expect(hookSignals[0]).toBe(controller.signal)
    expect(hookSignals[1]).toBe(controller.signal)
    expect(abortedDuringCall).toBe(false)
    expect(requestSignal?.aborted).toBe(true)
  })

  test("keeps a flag timeout that is longer than the reader default", async () => {
    const flags = createFlags({
      identify: () => user,
      provider: defineProvider({
        decideOne: async () => {
          await delay(40)
          return decision.boolean(true)
        },
        name: "slow",
      }),
      timeout: 10,
    })
    const readerTimed = flag.boolean("reader-timed", false)
    const slow = flag.boolean("slow", false, { timeout: 100 })

    const [readerDetails, slowDetails] = await flags.detailsMany([readerTimed, slow])

    expect(readerDetails.value).toBe(false)
    expect(readerDetails.error).toBeInstanceOf(EvaluationTimeoutError)
    expect(slowDetails).toEqual({ flagKey: "slow", source: "provider", value: true })
  })

  test("counts identity resolution against each flag's deadline", async () => {
    const decideOne = vi.fn(() => decision.boolean(true))
    const flags = createFlags({
      identify: async () => {
        await delay(40)
        return user
      },
      provider: defineProvider({ decideOne, name: "fast" }),
    })

    const [capped, roomy] = await flags.detailsMany([
      flag.boolean("capped", false, { timeout: 10 }),
      flag.boolean("roomy", false, { timeout: 200 }),
    ])

    expect(capped.error).toBeInstanceOf(EvaluationTimeoutError)
    expect(roomy).toEqual({ flagKey: "roomy", source: "provider", value: true })
    expect(decideOne).toHaveBeenCalledTimes(1)
  })

  test("gives each decideOne call the flag's own deadline", async () => {
    const signals: Record<string, AbortSignal | undefined> = {}
    const flags = createFlags({
      identify: () => user,
      provider: defineProvider({
        decideOne: async (item, _identity, { signal }) => {
          signals[item.key] = signal
          await delay(200)
          return decision.boolean(true)
        },
        name: "slow",
      }),
    })

    await flags.getMany([
      flag.boolean("capped", false, { timeout: 20 }),
      flag.boolean("unbounded", false),
    ])

    expect(signals.capped?.aborted).toBe(true)
    expect(signals.unbounded?.aborted).toBe(false)
  })

  test("stops a flag's signal from aborting once that flag has settled", async () => {
    const signals: Record<string, AbortSignal> = {}
    const flags = createFlags({
      hooks: [
        {
          before: (context) => {
            signals[context.flag.key] = context.signal
          },
        },
      ],
      identify: () => user,
      provider: defineProvider({
        decideOne: async (item) => {
          await delay(item.key === "fast" ? 5 : 150)
          return decision.boolean(true)
        },
        name: "single",
      }),
    })

    const [fast] = await flags.getMany([
      flag.boolean("fast", false, { timeout: 50 }),
      flag.boolean("slow", false, { timeout: 5000 }),
    ])

    expect(fast).toBe(true)
    expect(signals.fast?.aborted).toBe(false)
  })

  test("passes anonymous to concurrent batches without sharing their requests", async () => {
    const decide = vi.fn((items: readonly Flag[], identity: Identity | typeof anonymous) => {
      expect(identity).toBe(anonymous)
      return decideAll(items)
    })
    const flags = createFlags({
      cache: { coalesce: true },
      identify: () => anonymous,
      provider: defineProvider({ decide, name: "anon" }),
    })
    const anonymousFlag = flag.boolean("anonymous", false)

    const [first, second] = await Promise.all([
      flags.getMany([anonymousFlag]),
      flags.getMany([anonymousFlag]),
    ])

    expect(first).toEqual([true])
    expect(second).toEqual([true])
    expect(decide).toHaveBeenCalledTimes(2)
  })

  test("evaluates one batch for anonymous through for()", async () => {
    const identify = vi.fn((): Identity => ({ distinctId: "identified" }))
    const decide = vi.fn((items: readonly Flag[], _identity: Identity | typeof anonymous) =>
      decideAll(items)
    )
    const flags = createFlags({ identify, provider: defineProvider({ decide, name: "anon" }) })
    const anonymousFlag = flag.boolean("anonymous", false)

    expect(await flags.for(anonymous).getMany([anonymousFlag])).toEqual([true])
    expect(identify).not.toHaveBeenCalled()
    expect(decide).toHaveBeenCalledWith([anonymousFlag], anonymous, expect.any(Object))
  })

  test("does not join a flush round whose evaluations all timed out before the flush", async () => {
    vi.useFakeTimers()
    try {
      const decide = vi.fn(decideAll)
      // Fake timers that are due at one time run in creation order, with microtasks between them.
      // Every timer below is due at 1 ms, and they run in this order:
      // 1. `identified` resolves the identity. `slow` starts its wait, and `fast` opens round A.
      // 2. The `fast` timeout aborts every evaluation of round A before round A flushes.
      // 3. `slow` wakes and needs provider work while round A is still open.
      // 4. Round A flushes.
      // 5. `late` wakes and needs provider work. It must join the round that `slow` joined.
      const identified = new Promise<void>((resolve) => {
        setTimeout(resolve, 1)
      })
      const lateReady = Promise.withResolvers<null>()
      const flags = createFlags({
        cache: {
          // The `slow` key read comes just before `slow` needs provider work, so this timer comes
          // after the round A flush timer and before any timer that `slow` starts.
          key: (context) => {
            if (context.flag.key === "slow") {
              setTimeout(() => {
                lateReady.resolve(null)
              }, 0)
            }
            return context.flag.key
          },
        },
        hooks: [
          {
            before: async (context) => {
              if (context.flag.key === "slow") {
                await new Promise((resolve) => {
                  setTimeout(resolve, 0)
                })
              }
              if (context.flag.key === "late") {
                await lateReady.promise
              }
            },
          },
        ],
        identify: async () => {
          await identified
          return user
        },
        provider: defineProvider({ decide, name: "bulk" }),
      })
      const fast = flag.boolean("fast", false, { timeout: 1 })
      const slow = flag.boolean("slow", false, { timeout: 1000 })
      const late = flag.boolean("late", false, { timeout: 1000 })

      const pending = flags.detailsMany([fast, slow, late])
      await vi.advanceTimersByTimeAsync(10)
      const [fastDetails, slowDetails, lateDetails] = await pending

      expect(fastDetails).toMatchObject({ source: "default", value: false })
      expect(fastDetails.error).toBeInstanceOf(EvaluationTimeoutError)
      expect(slowDetails).toEqual({ flagKey: "slow", source: "provider", value: true })
      expect(lateDetails).toEqual({ flagKey: "late", source: "provider", value: true })
      expect(decide).toHaveBeenCalledTimes(1)
      expect(keysOf(decide.mock.calls[0]?.[0] ?? [])).toEqual(["slow", "late"])
    } finally {
      vi.useRealTimers()
    }
  })
})
