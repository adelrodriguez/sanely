import { setTimeout as sleep } from "node:timers/promises"
import { describe, expect, test, vi } from "vitest"
import type {
  Anonymous,
  ChangeListener,
  Decision,
  DecisionStore,
  ErrorReport,
  EvaluationContext,
  EvaluationError,
  Identity,
  StoreFailedReport,
} from "#index.ts"
import {
  anonymous,
  createFlags,
  defineProvider,
  EvaluationAbortedError,
  EvaluationTimeoutError,
  flag,
  InvalidDecisionError,
  ProviderFailedError,
} from "#index.ts"

function createDeferred<T>() {
  let rejectDeferred!: (reason?: unknown) => void
  let resolveDeferred!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolve, reject) => {
    rejectDeferred = reject
    resolveDeferred = resolve
  })
  return { promise, reject: rejectDeferred, resolve: resolveDeferred }
}

async function flushBackground(): Promise<void> {
  await sleep(0)
  await sleep(0)
}

const user = { distinctId: "user123" }
const identify = () => user
const betaAccess = flag.boolean("beta-access", false)
const theme = flag.variant("theme", ["light", "dark"], "light")
const TRUE: Decision = { type: "boolean", value: true }
const FALSE: Decision = { type: "boolean", value: false }

function storeReports(reports: ErrorReport[]): StoreFailedReport[] {
  return reports.filter((report): report is StoreFailedReport => report._tag === "StoreFailed")
}

// A provider whose decision and change notifications the test controls.
function controlledProvider() {
  const control = {
    notify: ((_keys?: readonly string[]): void => undefined) as ChangeListener,
    value: true,
  }
  const decideOne = vi.fn((): Decision => ({ type: "boolean", value: control.value }))
  const provider = defineProvider({
    decideOne,
    name: "controlled",
    subscribe: (notify) => {
      control.notify = notify
      return () => null
    },
  })
  return { control, decideOne, provider }
}

// A cached boolean flag whose provider value and change notifications the test controls.
function changingFlag(store: DecisionStore) {
  const { control, decideOne, provider } = controlledProvider()
  const flags = createFlags({ cache: { store }, identify, provider })
  return { control, decideOne, flags }
}

function slowTrue() {
  return vi.fn(async () => {
    await sleep(5)
    return TRUE
  })
}

describe("observer hook lifecycle", () => {
  test("shares one stable context through successful observer phases", async () => {
    const starts = new WeakMap<EvaluationContext, number>()
    const contexts: EvaluationContext[] = []
    const values: number[] = []
    const flags = createFlags({
      hooks: [
        {
          after(context) {
            contexts.push(context)
            values.push(starts.get(context) ?? 0)
          },
          before(context) {
            contexts.push(context)
            starts.set(context, 42)
          },
          finally(context) {
            contexts.push(context)
            values.push(starts.get(context) ?? 0)
            starts.delete(context)
          },
        },
      ],
      identify,
      provider: defineProvider({ decideOne: () => TRUE, name: "test" }),
    })

    expect(await flags.get(betaAccess)).toBe(true)
    await flushBackground()

    expect(values).toEqual([42, 42])
    expect(contexts.every((context) => context === contexts[0])).toBe(true)
    expect(contexts[0]?.flag).toBe(betaAccess)
    expect(contexts[0]?.identity).toBe(user)
  })

  test("snapshots hooks at build time so later option mutation does not affect evaluations", async () => {
    const snapshottedHook = vi.fn(() => Promise.resolve())
    const lateHook = vi.fn(() => Promise.resolve())
    const hooks = [{ before: snapshottedHook }]
    const flags = createFlags({
      hooks,
      identify,
      provider: defineProvider({ decideOne: () => TRUE, name: "test" }),
    })

    hooks.push({ before: lateHook })

    expect(await flags.get(betaAccess)).toBe(true)
    await flushBackground()

    expect(snapshottedHook).toHaveBeenCalledTimes(1)
    expect(lateHook).not.toHaveBeenCalled()
  })

  test("reports cache and provider decision sources to after hooks", async () => {
    const sources: string[] = []
    const cached = new Map<string, Decision>()
    const flags = createFlags({
      cache: {
        store: {
          get: (key) => Promise.resolve(cached.get(key)),
          set: (key, value) => {
            cached.set(key, value)
            return Promise.resolve()
          },
        },
      },
      hooks: [{ after: (_context, _decision, meta) => void sources.push(meta.source) }],
      identify,
      provider: defineProvider({ decideOne: () => TRUE, name: "test" }),
    })

    const providerDetails = await flags.details(betaAccess)
    expect(providerDetails.source).toBe("provider")
    await flushBackground()
    const cacheDetails = await flags.details(betaAccess)
    expect(cacheDetails.source).toBe("cache")
    await flushBackground()
    expect(sources).toEqual(["provider", "cache"])
  })

  test("passes the tagged evaluation error to error hooks", async () => {
    const errors: EvaluationError[] = []
    const failure = new Error("provider failed")
    const flags = createFlags({
      hooks: [{ error: (_context, error) => void errors.push(error) }],
      identify,
      provider: defineProvider({
        decideOne: () => {
          throw failure
        },
        name: "failing",
      }),
    })

    const details = await flags.details(betaAccess)
    expect(details.source).toBe("default")
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBe(details.error)
    expect(errors[0]?._tag).toBe("ProviderFailedError")
    expect(errors[0]).toBeInstanceOf(ProviderFailedError)
    expect(errors[0]?.cause).toBe(failure)
  })

  test("returns after an abort while error hooks continue to completion", async () => {
    const errorHookStarted = createDeferred<null>()
    const releaseErrorHook = createDeferred<null>()
    const finallyHook = vi.fn(() => Promise.resolve())
    const controller = new AbortController()
    const flags = createFlags({
      hooks: [
        {
          error: async () => {
            errorHookStarted.resolve(null)
            await releaseErrorHook.promise
          },
          finally: finallyHook,
        },
      ],
      identify,
      provider: defineProvider({
        decideOne: () => {
          throw new Error("provider failed")
        },
        name: "failing",
      }),
    })
    const evaluation = flags.details(betaAccess, { signal: controller.signal })
    await errorHookStarted.promise

    controller.abort(new Error("caller stopped"))
    const details = await evaluation

    expect(details).toMatchObject({ source: "default", value: false })
    expect(finallyHook).toHaveBeenCalledTimes(1)
    releaseErrorHook.resolve(null)
    await flushBackground()
  })

  test("does not await error hooks when the signal is already aborted", async () => {
    const releaseErrorHook = createDeferred<null>()
    const controller = new AbortController()
    const reason = new Error("caller stopped")
    controller.abort(reason)
    const flags = createFlags({
      hooks: [
        {
          error: async () => {
            await releaseErrorHook.promise
          },
        },
      ],
      identify,
      provider: defineProvider({ decideOne: () => TRUE, name: "test" }),
    })

    const details = await flags.details(betaAccess, { signal: controller.signal })

    expect(details.error).toBeInstanceOf(EvaluationAbortedError)
    expect(details.error?.cause).toBe(reason)
    releaseErrorHook.resolve(null)
  })

  for (const phase of ["before", "after", "error", "finally"] as const) {
    test(`reports a ${phase} observer failure without changing the result`, async () => {
      const reports: ErrorReport[] = []
      const fail = () => {
        throw new Error(`${phase} failed`)
      }
      const hook =
        phase === "before"
          ? { before: fail }
          : phase === "after"
            ? { after: fail }
            : phase === "error"
              ? { error: fail }
              : { finally: fail }
      const flags = createFlags({
        hooks: [hook],
        identify,
        onError: (report) => void reports.push(report),
        provider: defineProvider({
          decideOne: () => {
            if (phase === "error") {
              throw new Error("provider failed")
            }
            return TRUE
          },
          name: "test",
        }),
      })

      expect(await flags.get(betaAccess)).toBe(phase !== "error")
      await flushBackground()
      expect(reports).toHaveLength(1)
      expect(reports[0]).toMatchObject({
        _tag: "HookFailed",
        error: new Error(`${phase} failed`),
        hookIndex: 0,
        phase,
      })
    })
  }
})

describe("first-class cache", () => {
  test("uses the default evaluation key for a miss, write, and hit", async () => {
    const stored = new Map<string, Decision>()
    const get = vi.fn((key: string) => Promise.resolve(stored.get(key)))
    const set = vi.fn((key: string, decision: Decision) => {
      stored.set(key, decision)
      return Promise.resolve()
    })
    const decideOne = vi.fn((): Decision => ({ type: "variant", variant: "dark" }))
    const flags = createFlags({
      cache: { store: { get, set } },
      identify,
      provider: defineProvider({ decideOne, name: "test" }),
    })

    const providerDetails = await flags.details(theme)
    expect(providerDetails.source).toBe("provider")
    await flushBackground()
    expect(set).toHaveBeenCalledWith(
      '["test","theme","variant",["light","dark"],"string","user123"]',
      {
        type: "variant",
        variant: "dark",
      }
    )
    const cacheDetails = await flags.details(theme)
    expect(cacheDetails.source).toBe("cache")
    expect(decideOne).toHaveBeenCalledTimes(1)
  })

  test("keeps the decisions of readers with different providers apart in one store", async () => {
    const stored = new Map<string, Decision>()
    const store: DecisionStore = {
      get: (key) => Promise.resolve(stored.get(key)),
      set: (key, value) => {
        stored.set(key, value)
        return Promise.resolve()
      },
    }
    const production = createFlags({
      cache: { store },
      identify,
      provider: defineProvider({ decideOne: () => TRUE, name: "production" }),
    })
    const staging = createFlags({
      cache: { store },
      identify,
      provider: defineProvider({ decideOne: () => FALSE, name: "staging" }),
    })

    expect(await production.get(betaAccess)).toBe(true)
    await flushBackground()
    expect(await staging.details(betaAccess)).toMatchObject({ source: "provider", value: false })
  })

  test("skips the stored decision on a fresh read and stores the new one", async () => {
    const stored = new Map<string, Decision>()
    const store: DecisionStore = {
      get: (key) => Promise.resolve(stored.get(key)),
      set: (key, value) => {
        stored.set(key, value)
        return Promise.resolve()
      },
    }
    const { control, decideOne, provider } = controlledProvider()
    const flags = createFlags({ cache: { store }, identify, provider })

    expect(await flags.get(betaAccess)).toBe(true)
    await flushBackground()
    control.value = false
    expect(await flags.details(betaAccess)).toMatchObject({ source: "cache", value: true })

    expect(await flags.details(betaAccess, { fresh: true })).toMatchObject({
      source: "provider",
      value: false,
    })
    expect(await flags.detailsMany([betaAccess], { fresh: true })).toMatchObject([
      { source: "provider", value: false },
    ])
    await flushBackground()
    expect(await flags.details(betaAccess)).toMatchObject({ source: "cache", value: false })
    expect(decideOne).toHaveBeenCalledTimes(3)
  })

  test("adds the identity parts of a custom key to the evaluation key", async () => {
    type TenantIdentity = Identity & { tenant: string }
    const keys: string[] = []
    const flags = createFlags({
      cache: {
        key: ({ identity }) => [identity?.tenant],
        store: {
          get: (key) => {
            keys.push(key)
            return Promise.resolve(null)
          },
          set: () => Promise.resolve(),
        },
      },
      identify: () => ({ distinctId: "user123", tenant: "acme" }),
      provider: defineProvider({
        decideOne: (_flag, _identity: TenantIdentity) => TRUE,
        name: "test",
      }),
    })

    await flags.get(betaAccess)
    expect(keys).toHaveLength(1)
    expect(keys[0]).toContain('"beta-access"')
    expect(keys[0]).toContain("acme")
  })

  test("never shares a decision between flags under a custom key", async () => {
    type PlanIdentity = Identity & { plan: string }
    const stored = new Map<string, Decision>()
    const flags = createFlags({
      cache: {
        // The parts name only what the identity adds, as the docs recommend.
        key: ({ identity }) => [identity?.plan],
        store: {
          get: (key) => Promise.resolve(stored.get(key)),
          set: (key, value) => {
            stored.set(key, value)
            return Promise.resolve()
          },
        },
      },
      identify: () => ({ distinctId: "user123", plan: "pro" }),
      provider: defineProvider({
        decideOne: (item, _identity: PlanIdentity): Decision => ({
          type: "boolean",
          value: item.key === "a",
        }),
        name: "test",
      }),
    })
    const a = flag.boolean("a", false)
    const b = flag.boolean("b", false)

    expect(await Promise.all([flags.get(a), flags.get(b)])).toEqual([true, false])
    await flushBackground()
    expect(await flags.get(b)).toBe(false)
  })

  test("reports custom cache key failures without reading the store", async () => {
    const reports: ErrorReport[] = []
    const error = new Error("key failed")
    const get = vi.fn(() => Promise.resolve(null))
    const flags = createFlags({
      cache: {
        key: () => {
          throw error
        },
        store: { get, set: () => Promise.resolve() },
      },
      identify,
      onError: (report) => void reports.push(report),
      provider: defineProvider({ decideOne: () => TRUE, name: "test" }),
    })

    expect(await flags.get(betaAccess)).toBe(true)
    await flushBackground()

    expect(get).not.toHaveBeenCalled()
    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({
      _tag: "StoreFailed",
      error,
      flagKey: "beta-access",
      identity: user,
      key: "beta-access",
      operation: "key",
    })
  })

  test("keeps numeric and string identity keys separate", async () => {
    const stored = new Map<string, Decision>()
    const decideOne = vi.fn((_flag: unknown, identity: Identity): Decision => ({
      type: "boolean",
      value: typeof identity.distinctId === "number",
    }))
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
      provider: defineProvider({ decideOne, name: "test" }),
    })

    expect(await flags.for({ distinctId: 1 }).get(betaAccess)).toBe(true)
    expect(await flags.for({ distinctId: "1" }).get(betaAccess)).toBe(false)
    await flushBackground()
    expect(await flags.for({ distinctId: 1 }).get(betaAccess)).toBe(true)
    expect(await flags.for({ distinctId: "1" }).get(betaAccess)).toBe(false)
    expect(decideOne).toHaveBeenCalledTimes(2)
  })

  test("treats an invalid cached decision as a miss, reports it, and evicts it", async () => {
    const reports: ErrorReport[] = []
    const remove = vi.fn(() => Promise.resolve(true))
    const set = vi.fn(() => Promise.resolve())
    const decideOne = vi.fn((): Decision => ({ type: "variant", variant: "dark" }))
    const flags = createFlags({
      cache: {
        store: {
          delete: remove,
          get: () => Promise.resolve({ type: "variant", variant: "stale" }),
          set,
        },
      },
      identify,
      onError: (report) => void reports.push(report),
      provider: defineProvider({ decideOne, name: "test" }),
    })

    expect(await flags.get(theme)).toBe("dark")
    await flushBackground()

    expect(decideOne).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledTimes(1)
    expect(set).toHaveBeenCalledTimes(1)
    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({ _tag: "StoreFailed", operation: "validate" })
    expect(storeReports(reports)[0]?.error).toBeInstanceOf(InvalidDecisionError)
  })

  test("does not store a decision whose payload the parser rejects", async () => {
    const counted = flag.variant("counted", ["light", "dark"], "light", {
      payload: (payload) => {
        if (typeof payload !== "number") throw new TypeError("expected a number")
        return payload
      },
    })
    const set = vi.fn(() => Promise.resolve())
    const payloads: unknown[] = ["oops", 2]
    const decideOne = vi.fn((): Decision => ({
      payload: payloads.shift(),
      type: "variant",
      variant: "dark",
    }))
    const flags = createFlags({
      cache: { store: { get: () => Promise.resolve(null), set } },
      identify,
      provider: defineProvider({ decideOne, name: "test" }),
    })

    const rejected = await flags.details(counted)
    expect(rejected.error).toBeInstanceOf(InvalidDecisionError)
    await flushBackground()
    expect(set).not.toHaveBeenCalled()

    const accepted = await flags.details(counted)
    expect(accepted).toMatchObject({ payload: 2, source: "provider", value: "dark" })
    expect(decideOne).toHaveBeenCalledTimes(2)
  })

  test("runs the payload parser once for a stored provider decision", async () => {
    const parse = vi.fn((payload: unknown) => payload)
    const parsed = flag.variant("parsed", ["light", "dark"], "light", { payload: parse })
    const flags = createFlags({
      cache: { store: { get: () => Promise.resolve(null), set: () => Promise.resolve() } },
      identify,
      provider: defineProvider({
        decideOne: () => ({ payload: 1, type: "variant", variant: "dark" }),
        name: "test",
      }),
    })

    expect(await flags.details(parsed)).toMatchObject({ payload: 1, source: "provider" })
    await flushBackground()
    expect(parse).toHaveBeenCalledTimes(1)
  })

  test("treats a stored decision whose payload the parser rejects as a miss", async () => {
    const counted = flag.variant("counted", ["light", "dark"], "light", {
      payload: (payload) => {
        if (typeof payload !== "number") throw new TypeError("expected a number")
        return payload
      },
    })
    const reports: ErrorReport[] = []
    const remove = vi.fn(() => Promise.resolve(true))
    const decideOne = vi.fn((): Decision => ({ payload: 2, type: "variant", variant: "dark" }))
    const flags = createFlags({
      cache: {
        store: {
          delete: remove,
          get: () => Promise.resolve({ payload: "oops", type: "variant", variant: "dark" }),
          set: () => Promise.resolve(),
        },
      },
      identify,
      onError: (report) => void reports.push(report),
      provider: defineProvider({ decideOne, name: "test" }),
    })

    expect(await flags.details(counted)).toMatchObject({ payload: 2, source: "provider" })
    await flushBackground()
    expect(decideOne).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledTimes(1)
    expect(storeReports(reports).map(({ operation }) => operation)).toEqual(["validate"])
  })

  test.each([{}, { distinctId: "" }, { distinctId: Number.NaN }, { distinctId: true }])(
    "never shares a decision for an identity without a usable distinctId: %o",
    async (identity) => {
      const stored = new Map<string, Decision>()
      const decideOne = vi.fn((): Decision => TRUE)
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
        provider: defineProvider({ decideOne, name: "test" }),
      })

      // An untyped session object reaches the reader without a type check.
      const details = await flags.for(identity as Identity).details(betaAccess)
      expect(details).toMatchObject({ source: "default", value: false })
      expect(details.error?._tag).toBe("IdentityNotFoundError")
      await flushBackground()
      expect(stored.size).toBe(0)
      expect(decideOne).not.toHaveBeenCalled()
    }
  )

  test("reports get and set failures without failing evaluation", async () => {
    const reports: ErrorReport[] = []
    const flags = createFlags({
      cache: {
        store: {
          get: () => Promise.reject(new Error("read failed")),
          set: () => Promise.reject(new Error("write failed")),
        },
      },
      identify,
      onError: (report) => void reports.push(report),
      provider: defineProvider({ decideOne: () => TRUE, name: "test" }),
    })

    expect(await flags.get(betaAccess)).toBe(true)
    await flushBackground()
    expect(storeReports(reports).map(({ operation }) => operation)).toEqual(["get", "set"])
  })

  test("ignores cache eviction when the store has no delete operation", async () => {
    const reports: ErrorReport[] = []
    const flags = createFlags({
      cache: {
        store: {
          get: () => Promise.resolve({ type: "variant", variant: "stale" }),
          set: () => Promise.resolve(),
        },
      },
      identify,
      onError: (report) => void reports.push(report),
      provider: defineProvider({
        decideOne: () => ({ type: "variant", variant: "dark" }),
        name: "test",
      }),
    })

    expect(await flags.get(theme)).toBe("dark")
    await flushBackground()

    expect(storeReports(reports).map(({ operation }) => operation)).toEqual(["validate"])
  })

  test("attaches one invalidation subscription for the reader's lifetime", async () => {
    const detach = vi.fn(() => null)
    const subscribe = vi.fn((notify: ChangeListener) => {
      notify(["beta-access"])
      return detach
    })
    const flags = createFlags({
      cache: {
        store: {
          delete: () => Promise.resolve(true),
          get: () => Promise.resolve(null),
          set: () => Promise.resolve(),
        },
      },
      identify,
      provider: defineProvider({ decideOne: () => TRUE, name: "test", subscribe }),
    })

    expect(await flags.get(betaAccess)).toBe(true)
    expect(await flags.get(betaAccess)).toBe(true)
    expect(subscribe).toHaveBeenCalledTimes(1)
    expect(detach).not.toHaveBeenCalled()
  })

  test("shares one provider subscription between invalidation and change listeners", async () => {
    let notify!: ChangeListener
    const detach = vi.fn(() => null)
    const subscribe = vi.fn((listener: ChangeListener) => {
      notify = listener
      return detach
    })
    const cached = new Map<string, Decision>()
    const flags = createFlags({
      cache: {
        store: {
          delete: (key) => Promise.resolve(cached.delete(key)),
          get: (key) => Promise.resolve(cached.get(key)),
          set: (key, value) => {
            cached.set(key, value)
            return Promise.resolve()
          },
        },
      },
      identify,
      provider: defineProvider({ decideOne: () => TRUE, name: "test", subscribe }),
    })
    const changed: Array<readonly string[] | undefined> = []

    const unsubscribe = flags.subscribe((keys) => {
      changed.push(keys)
    })
    expect(await flags.get(betaAccess)).toBe(true)
    await flushBackground()
    expect(cached.size).toBe(1)
    expect(subscribe).toHaveBeenCalledTimes(1)

    notify(["beta-access"])
    await flushBackground()
    expect(cached.size).toBe(0)
    expect(changed).toEqual([["beta-access"]])

    unsubscribe()
    expect(detach).not.toHaveBeenCalled()
    expect(subscribe).toHaveBeenCalledTimes(1)
  })

  test("reports delete failures without failing invalidation", async () => {
    const reports: ErrorReport[] = []
    let notify!: ChangeListener
    const flags = createFlags({
      cache: {
        store: {
          delete: () => Promise.reject(new Error("delete failed")),
          get: () => Promise.resolve(null),
          set: () => Promise.resolve(),
        },
      },
      identify,
      onError: (report) => void reports.push(report),
      provider: defineProvider({
        decideOne: () => TRUE,
        name: "test",
        subscribe: (listener) => {
          notify = listener
          return () => null
        },
      }),
    })

    expect(await flags.get(betaAccess)).toBe(true)
    notify(["beta-access"])
    await flushBackground()
    expect(storeReports(reports).map(({ operation }) => operation)).toContain("delete")
  })

  test.each([
    { expected: ["first", "second"], keys: "first" },
    { expected: ["first", "second"], keys: null },
    { expected: ["first"], keys: ["first", 7] },
  ])(
    "reads a malformed change notification $keys as a change to $expected",
    async ({ expected, keys }) => {
      let notify!: ChangeListener
      const removed: string[] = []
      const flags = createFlags({
        cache: {
          store: {
            delete: (key: string) => {
              removed.push(key)
              return Promise.resolve(true)
            },
            get: () => Promise.resolve(null),
            set: () => Promise.resolve(),
          },
        },
        identify,
        provider: defineProvider({
          decideOne: () => TRUE,
          name: "test",
          subscribe: (listener) => {
            notify = listener
            return () => null
          },
        }),
      })
      const changes: unknown[] = []
      flags.subscribe((changed) => void changes.push(changed))

      await flags.get(flag.boolean("first", false))
      await flags.get(flag.boolean("second", false))
      // A JavaScript provider can send any value.
      notify(keys as never)
      await flushBackground()
      const removedFlags = removed.map((key) =>
        expected.find((flagKey) => key.includes(`"${flagKey}"`))
      )
      expect(removedFlags).toEqual(expected)
      expect(changes).toEqual([Array.isArray(keys) ? ["first"] : undefined])
    }
  )

  test("invalidates only notified flags and supports keyless invalidation", async () => {
    let notify!: ChangeListener
    const removed: string[] = []
    const flags = createFlags({
      cache: {
        store: {
          delete: (key: string) => {
            removed.push(key)
            return Promise.resolve(true)
          },
          get: () => Promise.resolve(null),
          set: () => Promise.resolve(),
        },
      },
      identify,
      provider: defineProvider({
        decideOne: () => TRUE,
        name: "test",
        subscribe: (listener) => {
          notify = listener
          return () => null
        },
      }),
    })
    const first = flag.boolean("first", false)
    const second = flag.boolean("second", false)

    await flags.get(first)
    await flags.get(second)
    notify(["first"])
    await flushBackground()
    expect(removed).toHaveLength(1)
    expect(removed[0]).toContain("first")

    notify()
    await flushBackground()
    expect(removed).toHaveLength(2)
    expect(removed[1]).toContain("second")
  })

  test("does not write a provider decision after its flag is invalidated", async () => {
    const pending = createDeferred<Decision>()
    const providerStarted = createDeferred<boolean>()
    const set = vi.fn(() => Promise.resolve())
    const decideOne = vi.fn((): Decision | Promise<Decision> => {
      if (decideOne.mock.calls.length > 1) return TRUE
      providerStarted.resolve(true)
      return pending.promise
    })
    let notify!: ChangeListener
    const flags = createFlags({
      cache: {
        store: { delete: () => Promise.resolve(true), get: () => Promise.resolve(null), set },
      },
      identify,
      provider: defineProvider({
        decideOne,
        name: "test",
        subscribe: (listener) => {
          notify = listener
          return () => null
        },
      }),
    })

    const evaluation = flags.get(betaAccess)
    await providerStarted.promise
    notify(["beta-access"])
    pending.resolve(TRUE)

    expect(await evaluation).toBe(true)
    await flushBackground()
    expect(set).not.toHaveBeenCalled()

    expect(await flags.get(betaAccess)).toBe(true)
    await flushBackground()
    expect(decideOne).toHaveBeenCalledTimes(2)
    expect(set).toHaveBeenCalledTimes(1)
  })

  test("does not restore a decision whose write was in flight during a change", async () => {
    const stored = new Map<string, Decision>()
    const write = createDeferred<null>()
    const writeStarted = createDeferred<null>()
    const { control, flags } = changingFlag({
      delete: (key) => Promise.resolve(stored.delete(key)),
      get: (key) => Promise.resolve(stored.get(key)),
      set: async (key, value) => {
        writeStarted.resolve(null)
        await write.promise
        stored.set(key, value)
      },
    })

    expect(await flags.get(betaAccess)).toBe(true)
    await writeStarted.promise
    control.value = false
    control.notify(["beta-access"])
    await flushBackground()
    write.resolve(null)
    await flushBackground()

    expect(await flags.get(betaAccess)).toBe(false)
  })

  test("keeps a newer write when an older write finishes after a change", async () => {
    const stored = new Map<string, Decision>()
    const firstWrite = createDeferred<null>()
    const firstWriteStarted = createDeferred<null>()
    let writes = 0
    const { control, decideOne, flags } = changingFlag({
      delete: (key) => Promise.resolve(stored.delete(key)),
      get: (key) => Promise.resolve(stored.get(key)),
      set: async (key, value) => {
        writes += 1
        if (writes === 1) {
          firstWriteStarted.resolve(null)
          await firstWrite.promise
        }
        stored.set(key, value)
      },
    })

    expect(await flags.get(betaAccess)).toBe(true)
    await firstWriteStarted.promise
    control.value = false
    control.notify(["beta-access"])
    expect(await flags.get(betaAccess)).toBe(false)
    firstWrite.resolve(null)
    await flushBackground()

    expect(await flags.details(betaAccess)).toMatchObject({ source: "cache", value: false })
    expect(decideOne).toHaveBeenCalledTimes(2)
  })

  test("does not read a decision while the delete for a change is in flight", async () => {
    const stored = new Map<string, Decision>()
    const deletion = createDeferred<null>()
    const { control, flags } = changingFlag({
      delete: async (key) => {
        await deletion.promise
        return stored.delete(key)
      },
      get: (key) => Promise.resolve(stored.get(key)),
      set: (key, value) => {
        stored.set(key, value)
        return Promise.resolve()
      },
    })

    expect(await flags.get(betaAccess)).toBe(true)
    await flushBackground()
    control.value = false
    control.notify(["beta-access"])

    expect(await flags.get(betaAccess)).toBe(false)
    deletion.resolve(null)
  })

  test("deletes a decision written after a read that spanned a change", async () => {
    const stored = new Map<string, Decision>()
    const firstRead = createDeferred<Decision | null>()
    const firstReadStarted = createDeferred<null>()
    const written = createDeferred<null>()
    let reads = 0
    const { control, decideOne, flags } = changingFlag({
      delete: (key) => Promise.resolve(stored.delete(key)),
      get: (key) => {
        reads += 1
        if (reads === 1) {
          firstReadStarted.resolve(null)
          return firstRead.promise
        }
        return Promise.resolve(stored.get(key))
      },
      set: (key, value) => {
        stored.set(key, value)
        written.resolve(null)
        return Promise.resolve()
      },
    })

    const evaluation = flags.get(betaAccess)
    await firstReadStarted.promise
    control.notify(["beta-access"])
    firstRead.resolve(null)
    expect(await evaluation).toBe(true)
    await written.promise
    expect(stored.size).toBe(1)

    control.value = false
    control.notify(["beta-access"])
    await flushBackground()

    expect(stored.size).toBe(0)
    expect(await flags.details(betaAccess)).toMatchObject({ source: "provider", value: false })
    expect(decideOne).toHaveBeenCalledTimes(2)
  })

  test("does not read or write the cache for an anonymous identity", async () => {
    const get = vi.fn(() => Promise.resolve<Decision | null>(null))
    const set = vi.fn(() => Promise.resolve())
    const flags = createFlags({
      cache: { store: { get, set } },
      identify: () => anonymous,
      provider: defineProvider({
        decideOne: (_flag, _identity: Identity | Anonymous) => TRUE,
        name: "test",
      }),
    })

    expect(await flags.get(betaAccess)).toBe(true)
    await flushBackground()
    expect(get).not.toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
  })

  test("does not call a custom key function for an anonymous identity", async () => {
    const key = vi.fn(() => ["shared"])
    const get = vi.fn(() => Promise.resolve<Decision | null>(null))
    const flags = createFlags({
      cache: { key, store: { get, set: () => Promise.resolve() } },
      identify: () => anonymous,
      provider: defineProvider({
        decideOne: (_flag, _identity: Identity | Anonymous) => TRUE,
        name: "test",
      }),
    })

    expect(await flags.get(betaAccess)).toBe(true)
    expect(key).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
  })

  test("aborts while the store read is pending", async () => {
    const pending = createDeferred<Decision | undefined>()
    const controller = new AbortController()
    const reason = new Error("caller stopped")
    const flags = createFlags({
      cache: { store: { get: () => pending.promise, set: () => Promise.resolve() } },
      identify,
      provider: defineProvider({ decideOne: () => TRUE, name: "test" }),
    })
    const evaluation = flags.details(betaAccess, { signal: controller.signal })

    await sleep(0)
    controller.abort(reason)
    const details = await evaluation
    expect(details).toMatchObject({ flagKey: "beta-access", source: "default", value: false })
    expect(details.error).toBeInstanceOf(EvaluationAbortedError)
    expect(details.error?.cause).toBe(reason)
  })

  test("writes only once for a coalesced provider leader", async () => {
    const set = vi.fn(() => Promise.resolve())
    const decideOne = slowTrue()
    const flags = createFlags({
      cache: { coalesce: true, store: { get: () => Promise.resolve(null), set } },
      identify,
      provider: defineProvider({ decideOne, name: "test" }),
    })

    expect(await Promise.all([flags.get(betaAccess), flags.get(betaAccess)])).toEqual([true, true])
    await flushBackground()
    expect(decideOne).toHaveBeenCalledTimes(1)
    expect(set).toHaveBeenCalledTimes(1)
  })

  test("does not wait for a cache write", async () => {
    const write = createDeferred<null>()
    const flags = createFlags({
      cache: {
        store: { get: () => Promise.resolve(null), set: async () => void (await write.promise) },
      },
      identify,
      provider: defineProvider({ decideOne: () => TRUE, name: "test" }),
    })

    expect(await flags.get(betaAccess)).toBe(true)
    write.resolve(null)
  })
})

describe("request coalescing", () => {
  test("shares concurrent provider work for one evaluation key by default", async () => {
    const decideOne = slowTrue()
    const flags = createFlags({ identify, provider: defineProvider({ decideOne, name: "test" }) })

    expect(
      await Promise.all([flags.get(betaAccess), flags.get(betaAccess), flags.get(betaAccess)])
    ).toEqual([true, true, true])
    expect(decideOne).toHaveBeenCalledTimes(1)
  })

  test("gives every evaluation its own provider call when coalescing is disabled", async () => {
    const decideOne = slowTrue()
    const flags = createFlags({
      cache: { coalesce: false },
      identify,
      provider: defineProvider({ decideOne, name: "test" }),
    })

    expect(
      await Promise.all([flags.get(betaAccess), flags.get(betaAccess), flags.get(betaAccess)])
    ).toEqual([true, true, true])
    expect(decideOne).toHaveBeenCalledTimes(3)
  })

  test("never coalesces anonymous evaluations", async () => {
    const decideOne = vi.fn(async (_flag: unknown, _identity: Identity | Anonymous) => {
      await sleep(5)
      return TRUE
    })
    const flags = createFlags({
      identify: () => anonymous,
      provider: defineProvider({ decideOne, name: "test" }),
    })

    expect(await Promise.all([flags.get(betaAccess), flags.get(betaAccess)])).toEqual([true, true])
    expect(decideOne).toHaveBeenCalledTimes(2)
    expect(decideOne.mock.calls.every(([, identity]) => identity === anonymous)).toBe(true)
  })

  test("does not share provider work across readers built from one options object", async () => {
    const decideOne = slowTrue()
    const options = { identify, provider: defineProvider({ decideOne, name: "test" }) }
    const first = createFlags(options)
    const second = createFlags(options)

    expect(await Promise.all([first.get(betaAccess), second.get(betaAccess)])).toEqual([true, true])
    expect(decideOne).toHaveBeenCalledTimes(2)
  })

  test("does not share provider work across incompatible flag shapes", async () => {
    const decideOne = vi.fn(async (shape: { kind: string }): Promise<Decision> => {
      await sleep(5)
      return shape.kind === "boolean" ? TRUE : { type: "variant", variant: "a" }
    })
    const flags = createFlags({
      cache: { coalesce: true },
      identify,
      provider: defineProvider({ decideOne, name: "test" }),
    })
    const booleanFlag = flag.boolean("shared", false)
    const variantFlag = flag.variant("shared", ["a", "b"], "a")

    expect(await Promise.all([flags.get(booleanFlag), flags.get(variantFlag)])).toEqual([true, "a"])
    expect(decideOne).toHaveBeenCalledTimes(2)
  })

  test("supports an identity-sensitive coalescing key", async () => {
    type TenantIdentity = Identity & { tenant: string }
    const decideOne = vi.fn(async (_flag: unknown, _identity: TenantIdentity) => {
      await sleep(5)
      return TRUE
    })
    const flags = createFlags({
      cache: {
        coalesce: true,
        key: ({ identity }) => [identity?.tenant],
      },
      provider: defineProvider({ decideOne, name: "test" }),
    })

    await Promise.all([
      flags.for({ distinctId: "user123", tenant: "first" }).get(betaAccess),
      flags.for({ distinctId: "user123", tenant: "second" }).get(betaAccess),
    ])
    expect(decideOne).toHaveBeenCalledTimes(2)
  })

  test("does not cancel the leader when a follower aborts", async () => {
    const pending = createDeferred<Decision>()
    const controller = new AbortController()
    const reason = new Error("follower stopped")
    const flags = createFlags({
      cache: { coalesce: true },
      identify,
      provider: defineProvider({ decideOne: () => pending.promise, name: "test" }),
    })
    const leader = flags.get(betaAccess)
    await sleep(0)
    const follower = flags.details(betaAccess, { signal: controller.signal })
    await sleep(0)

    controller.abort(reason)
    pending.resolve(TRUE)

    expect(await leader).toBe(true)
    const followerDetails = await follower
    expect(followerDetails.source).toBe("default")
    expect(followerDetails.error).toBeInstanceOf(EvaluationAbortedError)
    expect(followerDetails.error?.cause).toBe(reason)
  })

  test("keeps the shared provider call for a follower when the leader cancels", async () => {
    const pending = createDeferred<Decision>()
    const providerSignal = createDeferred<AbortSignal>()
    const decideOne = vi.fn(
      (_flag: unknown, _identity: Identity, options: { signal: AbortSignal }) => {
        providerSignal.resolve(options.signal)
        return pending.promise
      }
    )
    const followerJoined = createDeferred<null>()
    let keyReads = 0
    const flags = createFlags({
      cache: {
        // The second key read is the follower's, in the same synchronous step as its join.
        key: () => {
          keyReads += 1
          if (keyReads === 2) followerJoined.resolve(null)
          return []
        },
      },
      identify,
      provider: defineProvider({ decideOne, name: "test" }),
    })
    const controller = new AbortController()
    const reason = new Error("leader stopped")

    const leader = flags.details(betaAccess, { signal: controller.signal })
    const signal = await providerSignal.promise
    const follower = flags.details(betaAccess)
    await followerJoined.promise
    controller.abort(reason)
    pending.resolve(TRUE)

    const leaderDetails = await leader
    expect(leaderDetails).toMatchObject({ flagKey: "beta-access", source: "default", value: false })
    expect(leaderDetails.error?.cause).toBe(reason)
    expect(await follower).toEqual({ flagKey: "beta-access", source: "provider", value: true })
    expect(signal.aborted).toBe(false)
    expect(decideOne).toHaveBeenCalledTimes(1)
  })

  test("stores a shared decision when the evaluation that started the call leaves", async () => {
    const stored = new Map<string, Decision>()
    const pending = createDeferred<Decision>()
    const started = createDeferred<null>()
    const decideOne = vi.fn(() => {
      started.resolve(null)
      return pending.promise
    })
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
      identify,
      provider: defineProvider({ decideOne, name: "test" }),
    })
    const controller = new AbortController()

    const leader = flags.details(betaAccess, { signal: controller.signal })
    await started.promise
    const follower = flags.details(betaAccess)
    await flushBackground()
    controller.abort(new Error("leader stopped"))
    const leaderDetails = await leader
    expect(leaderDetails.source).toBe("default")
    pending.resolve(TRUE)

    expect(await follower).toMatchObject({ source: "provider", value: true })
    await flushBackground()
    expect(await flags.details(betaAccess)).toMatchObject({ source: "cache", value: true })
    expect(decideOne).toHaveBeenCalledTimes(1)
  })

  test("keeps the shared provider call for a follower with a later deadline", async () => {
    vi.useFakeTimers()
    try {
      const pending = createDeferred<Decision>()
      const providerStarted = createDeferred<null>()
      const decideOne = vi.fn(
        (_flag: unknown, _identity: Identity, options: { signal: AbortSignal }) => {
          providerStarted.resolve(null)
          return new Promise<Decision>((resolve, reject) => {
            options.signal.addEventListener("abort", () => {
              reject(new Error("provider stopped"))
            })
            void pending.promise.then(resolve)
          })
        }
      )
      const followerJoined = createDeferred<null>()
      let keyReads = 0
      const flags = createFlags({
        cache: {
          key: () => {
            keyReads += 1
            if (keyReads === 2) followerJoined.resolve(null)
            return []
          },
        },
        identify,
        provider: defineProvider({ decideOne, name: "test" }),
      })
      const fast = flag.boolean("beta-access", false, { timeout: 10 })
      const slow = flag.boolean("beta-access", false, { timeout: 1000 })

      const leader = flags.details(fast)
      await providerStarted.promise
      const follower = flags.details(slow)
      await followerJoined.promise
      await vi.advanceTimersByTimeAsync(10)
      const leaderDetails = await leader
      expect(leaderDetails.source).toBe("default")
      expect(leaderDetails.error).toBeInstanceOf(EvaluationTimeoutError)

      pending.resolve(TRUE)
      expect(await follower).toEqual({ flagKey: "beta-access", source: "provider", value: true })
      expect(decideOne).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  test("cancels the shared provider call once every caller has cancelled", async () => {
    const providerSignal = createDeferred<AbortSignal>()
    const decideOne = vi.fn(
      (
        _flag: unknown,
        _identity: Identity,
        options: { signal: AbortSignal }
      ): Decision | Promise<Decision> => {
        if (decideOne.mock.calls.length > 1) {
          return TRUE
        }
        providerSignal.resolve(options.signal)
        return createDeferred<Decision>().promise
      }
    )
    const followerJoined = createDeferred<null>()
    let keyReads = 0
    const flags = createFlags({
      cache: {
        key: () => {
          keyReads += 1
          if (keyReads === 2) followerJoined.resolve(null)
          return []
        },
      },
      identify,
      provider: defineProvider({ decideOne, name: "test" }),
    })
    const leaderController = new AbortController()
    const followerController = new AbortController()

    const leader = flags.details(betaAccess, { signal: leaderController.signal })
    const signal = await providerSignal.promise
    const follower = flags.details(betaAccess, { signal: followerController.signal })
    await followerJoined.promise

    leaderController.abort(new Error("leader stopped"))
    expect(signal.aborted).toBe(false)
    followerController.abort(new Error("follower stopped"))
    expect(signal.aborted).toBe(true)

    const [leaderDetails, followerDetails] = await Promise.all([leader, follower])
    expect(leaderDetails.source).toBe("default")
    expect(followerDetails.source).toBe("default")
    expect(await flags.get(betaAccess)).toBe(true)
    expect(decideOne).toHaveBeenCalledTimes(2)
  })

  test("keeps a batch's shared provider call for an outside follower when the batch cancels", async () => {
    const batchProvider = createDeferred<Record<string, Decision>>()
    const providerSignal = createDeferred<AbortSignal>()
    const decide = vi.fn(
      (_flags: unknown, _identity: Identity, options: { signal: AbortSignal }) => {
        providerSignal.resolve(options.signal)
        return batchProvider.promise
      }
    )
    const followerJoined = createDeferred<null>()
    let keyReads = 0
    const flags = createFlags({
      cache: {
        key: () => {
          keyReads += 1
          if (keyReads === 2) followerJoined.resolve(null)
          return []
        },
      },
      identify,
      provider: defineProvider({ decide, name: "test" }),
    })
    const controller = new AbortController()

    const batch = flags.detailsMany([betaAccess], { signal: controller.signal })
    const signal = await providerSignal.promise
    const follower = flags.details(betaAccess)
    await followerJoined.promise
    controller.abort(new Error("batch stopped"))
    const [batchDetails] = await batch
    expect(batchDetails.source).toBe("default")
    expect(signal.aborted).toBe(false)
    batchProvider.resolve({ "beta-access": TRUE })

    expect(await follower).toEqual({ flagKey: "beta-access", source: "provider", value: true })
    expect(decide).toHaveBeenCalledTimes(1)
  })

  // Each case drops in-flight provider work on a change notification, with a different store.
  const invalidationStores: Array<[string, DecisionStore | undefined]> = [
    [
      "a store that can delete",
      {
        delete: () => Promise.resolve(true),
        get: () => Promise.resolve(null),
        set: () => Promise.resolve(),
      },
    ],
    ["no store", undefined],
    [
      "a store that cannot delete",
      { get: () => Promise.resolve(null), set: () => Promise.resolve() },
    ],
  ]
  for (const [label, store] of invalidationStores) {
    test(`does not coalesce onto in-flight provider work after invalidation with ${label}`, async () => {
      const first = createDeferred<Decision>()
      let notifyChange: ChangeListener | undefined
      const decideOne = vi.fn((): Decision | Promise<Decision> =>
        decideOne.mock.calls.length === 1 ? first.promise : FALSE
      )
      const flags = createFlags({
        cache: store ? { coalesce: true, store } : { coalesce: true },
        identify,
        provider: defineProvider({
          decideOne,
          name: "test",
          subscribe: (notify) => {
            notifyChange = notify
            return () => null
          },
        }),
      })
      const enabled = flag.boolean("beta-access", true)

      const leader = flags.get(enabled)
      await sleep(0)
      notifyChange?.(["beta-access"])
      const late = flags.get(enabled)
      await sleep(0)

      first.resolve(TRUE)
      expect(await leader).toBe(true)
      expect(await late).toBe(false)
      expect(decideOne).toHaveBeenCalledTimes(2)
    })
  }

  test("does not write a pre-change decision into a store that cannot delete", async () => {
    const first = createDeferred<Decision>()
    const stored = new Map<string, Decision>()
    let notifyChange: ChangeListener | undefined
    const decideOne = vi.fn((): Decision | Promise<Decision> =>
      decideOne.mock.calls.length === 1 ? first.promise : FALSE
    )
    const flags = createFlags({
      cache: {
        store: {
          get: (key) => Promise.resolve(stored.get(key) ?? null),
          set: (key, decision) => {
            stored.set(key, decision)
            return Promise.resolve()
          },
        },
      },
      identify,
      provider: defineProvider({
        decideOne,
        name: "test",
        subscribe: (notify) => {
          notifyChange = notify
          return () => null
        },
      }),
    })
    const enabled = flag.boolean("beta-access", true)

    const leader = flags.get(enabled)
    await sleep(0)
    notifyChange?.(["beta-access"])
    const late = flags.get(enabled)
    await sleep(0)

    first.resolve(TRUE)
    expect(await leader).toBe(true)
    expect(await late).toBe(false)
    await flushBackground()
    expect(await flags.get(enabled)).toBe(false)
  })

  test("degrades softly when subscribe throws instead of poisoning coalescing", async () => {
    const reports: ErrorReport[] = []
    const flags = createFlags({
      identify,
      onError: (report) => void reports.push(report),
      provider: defineProvider({
        decideOne: () => TRUE,
        name: "test",
        subscribe: () => {
          throw new Error("subscribe failed")
        },
      }),
    })

    expect(await flags.get(betaAccess)).toBe(true)
    expect(await flags.get(betaAccess)).toBe(true)
    await flushBackground()
    expect(reports.length).toBeGreaterThanOrEqual(1)
    expect(reports[0]).toEqual({ _tag: "SubscribeFailed", error: new Error("subscribe failed") })
  })

  test("reports a throwing subscribe to a change listener and returns a no-op unsubscribe", async () => {
    const reports: ErrorReport[] = []
    const flags = createFlags({
      identify,
      onError: (report) => void reports.push(report),
      provider: defineProvider({
        decideOne: () => TRUE,
        name: "test",
        subscribe: () => {
          throw new Error("subscribe failed")
        },
      }),
    })

    const unsubscribe = flags.subscribe(() => null)
    expect(() => {
      unsubscribe()
    }).not.toThrow()
    await flushBackground()
    expect(reports).toEqual([{ _tag: "SubscribeFailed", error: new Error("subscribe failed") }])
  })

  test("rejects every follower with the leader's provider failure and permits a retry", async () => {
    const pending = createDeferred<Decision>()
    const failure = { code: "unavailable" }
    const decideOne = vi.fn((): Promise<Decision> => pending.promise)
    const flags = createFlags({
      cache: { coalesce: true },
      identify,
      provider: defineProvider({ decideOne, name: "test" }),
    })
    const evaluations = [
      flags.details(betaAccess),
      flags.details(betaAccess),
      flags.details(betaAccess),
    ]
    await sleep(0)

    pending.reject(failure)

    const details = await Promise.all(evaluations)
    expect(decideOne).toHaveBeenCalledTimes(1)
    expect(details.map((result) => result.source)).toEqual(["default", "default", "default"])
    for (const result of details) {
      expect(result.error).toBeInstanceOf(ProviderFailedError)
      expect(result.error).toMatchObject({ provider: "test" })
      expect(result.error?.cause).toBe(failure)
    }
    expect(details[1]?.error).toBe(details[0]?.error)

    decideOne.mockImplementation(() => Promise.resolve(TRUE))
    expect(await flags.get(betaAccess)).toBe(true)
    expect(decideOne).toHaveBeenCalledTimes(2)
  })
})

describe("timeouts and fallback", () => {
  test("returns the default and reports a timeout", async () => {
    const flags = createFlags({
      identify,
      provider: defineProvider({
        decideOne: () => createDeferred<Decision>().promise,
        name: "test",
      }),
      timeout: 5,
    })

    const details = await flags.details(betaAccess)
    expect(details.source).toBe("default")
    expect(details.error).toBeInstanceOf(EvaluationTimeoutError)
    expect(details.error).toMatchObject({ _tag: "EvaluationTimeoutError", timeout: 5 })
  })

  test("uses the flag's timeout instead of the reader's", async () => {
    const flags = createFlags({
      identify,
      provider: defineProvider({
        decideOne: () => createDeferred<Decision>().promise,
        name: "test",
      }),
      timeout: 1000,
    })

    const details = await flags.details(flag.boolean("beta-access", false, { timeout: 5 }))
    expect(details.error).toMatchObject({ _tag: "EvaluationTimeoutError", timeout: 5 })
  })
})
