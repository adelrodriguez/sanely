import { setTimeout as sleep } from "node:timers/promises"
import { describe, expect, test, vi } from "vitest"
import type {
  DecisionCache,
  DecisionCacheErrorReport,
  Decision,
  HookContext,
  HookErrorReport,
} from "#lib/types/index.ts"
import { createFlags } from "#factory.ts"
import { FlagTimeoutError, InvalidVariantError } from "#lib/shared/errors.ts"

function createDeferred<T>() {
  let rejectDeferred!: (reason?: Error) => void
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

// A cached boolean flag whose provider value and change notifications the test controls.
function changingFlag(cache: DecisionCache) {
  const provider = {
    notify: (_change: { keys?: readonly string[] }): void => undefined,
    value: true,
  }
  const decide = vi.fn((): Decision => ({ type: "boolean", value: provider.value }))
  const flag = createFlags({
    cache,
    decide,
    identify: () => ({ distinctId: "user123" }),
    subscribe: (listener) => {
      provider.notify = listener
      return () => null
    },
  })
  return { decide, evaluator: flag({ defaultValue: false, key: "beta-access" }), provider }
}

describe("observer hook lifecycle", () => {
  test("shares one stable context through successful observer phases", async () => {
    const starts = new WeakMap<HookContext, number>()
    const contexts: HookContext[] = []
    const values: number[] = []
    const flag = createFlags({
      decide: () => ({ type: "boolean", value: true }),
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
      identify: () => ({ distinctId: "user123" }),
    })

    expect(await flag({ defaultValue: false, key: "beta-access" })()).toBe(true)
    await flushBackground()

    expect(values).toEqual([42, 42])
    expect(contexts.every((context) => context === contexts[0])).toBe(true)
  })

  test("snapshots hooks at build time so later config mutation does not affect evaluations", async () => {
    const snapshottedHook = vi.fn(() => Promise.resolve())
    const lateHook = vi.fn(() => Promise.resolve())
    const hooks = [{ before: snapshottedHook }]
    const flag = createFlags({
      decide: () => ({ type: "boolean", value: true }),
      hooks,
      identify: () => ({ distinctId: "user123" }),
    })

    hooks.push({ before: lateHook })

    expect(await flag({ defaultValue: false, key: "beta-access" })()).toBe(true)
    await flushBackground()

    expect(snapshottedHook).toHaveBeenCalledTimes(1)
    expect(lateHook).not.toHaveBeenCalled()
  })

  test("reports cache and provider decision sources to after hooks", async () => {
    const sources: string[] = []
    const cache = new Map<string, Decision>()
    const flag = createFlags({
      cache: {
        get: (key) => Promise.resolve(cache.get(key)),
        set: (key, value) => {
          cache.set(key, value)
          return Promise.resolve()
        },
      },
      decide: () => ({ type: "boolean", value: true }),
      hooks: [{ after: (_context, _decision, meta) => void sources.push(meta.source) }],
      identify: () => ({ distinctId: "user123" }),
    })
    const evaluator = flag({ defaultValue: false, key: "beta-access" })

    const providerDetails = await evaluator.details()
    expect(providerDetails.source).toBe("provider")
    await flushBackground()
    const cacheDetails = await evaluator.details()
    expect(cacheDetails.source).toBe("cache")
    await flushBackground()
    expect(sources).toEqual(["provider", "cache"])
  })

  test("returns after an abort while error hooks continue to completion", async () => {
    const errorHookStarted = createDeferred<null>()
    const releaseErrorHook = createDeferred<null>()
    const finallyHook = vi.fn(() => Promise.resolve())
    const controller = new AbortController()
    const flag = createFlags({
      decide: () => {
        throw new Error("provider failed")
      },
      hooks: [
        {
          error: async () => {
            errorHookStarted.resolve(null)
            await releaseErrorHook.promise
          },
          finally: finallyHook,
        },
      ],
      identify: () => ({ distinctId: "user123" }),
    })
    const evaluation = flag({ defaultValue: false, key: "beta-access" }).details({
      signal: controller.signal,
    })
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
    controller.abort(new Error("caller stopped"))
    const flag = createFlags({
      decide: () => ({ type: "boolean", value: true }),
      hooks: [
        {
          error: async () => {
            await releaseErrorHook.promise
          },
        },
      ],
      identify: () => ({ distinctId: "user123" }),
    })

    const details = await flag({ defaultValue: false, key: "beta-access" }).details({
      signal: controller.signal,
    })

    expect(details.error?.message).toBe("caller stopped")
    releaseErrorHook.resolve(null)
  })

  for (const phase of ["before", "after", "error", "finally"] as const) {
    test(`reports a ${phase} observer failure without changing the result`, async () => {
      const reports: HookErrorReport[] = []
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
      const flag = createFlags({
        decide: () => {
          if (phase === "error") {
            throw new Error("provider failed")
          }
          return { type: "boolean", value: true }
        },
        hooks: [hook],
        identify: () => ({ distinctId: "user123" }),
        onHookError: (report) => void reports.push(report),
      })

      expect(await flag({ defaultValue: false, key: "beta-access" })()).toBe(phase !== "error")
      await flushBackground()
      expect(reports).toHaveLength(1)
      expect(reports[0]?.phase).toBe(phase)
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
    const decide = vi.fn(() => ({ type: "variant", variant: "dark" }) as const)
    const flag = createFlags({
      cache: { get, set },
      decide,
      identify: () => ({ distinctId: "user123" }),
    })
    const theme = flag({ defaultValue: "light", key: "theme", variants: ["light", "dark"] })

    const providerDetails = await theme.details()
    expect(providerDetails.source).toBe("provider")
    await flushBackground()
    expect(set).toHaveBeenCalledWith('["theme","variant",["light","dark"],"string","user123"]', {
      type: "variant",
      variant: "dark",
    })
    const cacheDetails = await theme.details()
    expect(cacheDetails.source).toBe("cache")
    expect(decide).toHaveBeenCalledTimes(1)
  })

  test("supports a custom identity-sensitive key", async () => {
    const keys: string[] = []
    const flag = createFlags<{ distinctId: string; tenant: string }>({
      cache: {
        get: (key) => {
          keys.push(key)
          return Promise.resolve(null)
        },
        set: () => Promise.resolve(),
      },
      decide: () => ({ type: "boolean", value: true }),
      evaluationKey: (context) => `${context.identity?.tenant}:${context.flagKey}`,
      identify: () => ({ distinctId: "user123", tenant: "acme" }),
    })

    await flag({ defaultValue: false, key: "beta-access" })()
    expect(keys).toEqual(["acme:beta-access"])
  })

  test("reports custom cache key failures without reading the store", async () => {
    const reports: DecisionCacheErrorReport[] = []
    const error = new Error("key failed")
    const get = vi.fn(() => Promise.resolve(null))
    const flag = createFlags({
      cache: {
        get,
        set: () => Promise.resolve(),
      },
      decide: () => ({ type: "boolean", value: true }),
      evaluationKey: () => {
        throw error
      },
      identify: () => ({ distinctId: "user123" }),
      onCacheError: (report) => void reports.push(report),
    })

    expect(await flag({ defaultValue: false, key: "beta-access" })()).toBe(true)
    await flushBackground()

    expect(get).not.toHaveBeenCalled()
    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({
      error,
      flagKey: "beta-access",
      key: "beta-access",
      operation: "key",
    })
  })

  test("keeps numeric and string identity keys separate", async () => {
    const stored = new Map<string, Decision>()
    const decide = vi.fn((_key: string, identity: { distinctId: number | string }) => ({
      type: "boolean" as const,
      value: typeof identity.distinctId === "number",
    }))
    const flag = createFlags<{ distinctId: number | string }>({
      cache: {
        get: (key) => Promise.resolve(stored.get(key)),
        set: (key, value) => {
          stored.set(key, value)
          return Promise.resolve()
        },
      },
      decide,
      identify: () => ({ distinctId: "unused" }),
    })
    const evaluator = flag({ defaultValue: false, key: "beta-access" })

    expect(await evaluator({ identity: { distinctId: 1 } })).toBe(true)
    expect(await evaluator({ identity: { distinctId: "1" } })).toBe(false)
    await flushBackground()
    expect(await evaluator({ identity: { distinctId: 1 } })).toBe(true)
    expect(await evaluator({ identity: { distinctId: "1" } })).toBe(false)
    expect(decide).toHaveBeenCalledTimes(2)
  })

  test("treats an invalid cached decision as a miss, reports it, and evicts it", async () => {
    const reports: DecisionCacheErrorReport[] = []
    const remove = vi.fn(() => Promise.resolve(true))
    const set = vi.fn(() => Promise.resolve())
    const decide = vi.fn(() => ({ type: "variant", variant: "dark" }) as const)
    const flag = createFlags({
      cache: {
        delete: remove,
        get: () => Promise.resolve({ type: "variant", variant: "stale" }),
        set,
      },
      decide,
      identify: () => ({ distinctId: "user123" }),
      onCacheError: (report) => void reports.push(report),
    })

    expect(await flag({ defaultValue: "light", key: "theme", variants: ["light", "dark"] })()).toBe(
      "dark"
    )
    await flushBackground()

    expect(decide).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledTimes(1)
    expect(set).toHaveBeenCalledTimes(1)
    expect(reports).toHaveLength(1)
    expect(reports[0]?.operation).toBe("validate")
    expect(reports[0]?.error).toBeInstanceOf(InvalidVariantError)
  })

  test("reports get and set failures without failing evaluation", async () => {
    const reports: DecisionCacheErrorReport[] = []
    const flag = createFlags({
      cache: {
        get: () => Promise.reject(new Error("read failed")),
        set: () => Promise.reject(new Error("write failed")),
      },
      decide: () => ({ type: "boolean", value: true }),
      identify: () => ({ distinctId: "user123" }),
      onCacheError: (report) => void reports.push(report),
    })

    expect(await flag({ defaultValue: false, key: "beta-access" })()).toBe(true)
    await flushBackground()
    expect(reports.map(({ operation }) => operation)).toEqual(["get", "set"])
  })

  test("ignores cache eviction when the store has no delete operation", async () => {
    const reports: DecisionCacheErrorReport[] = []
    const flag = createFlags({
      cache: {
        get: () => Promise.resolve({ type: "variant", variant: "stale" }),
        set: () => Promise.resolve(),
      },
      decide: () => ({ type: "variant", variant: "dark" }),
      identify: () => ({ distinctId: "user123" }),
      onCacheError: (report) => void reports.push(report),
    })

    expect(await flag({ defaultValue: "light", key: "theme", variants: ["light", "dark"] })()).toBe(
      "dark"
    )
    await flushBackground()

    expect(reports.map(({ operation }) => operation)).toEqual(["validate"])
  })

  test("attaches one invalidation subscription for the factory's lifetime", async () => {
    const subscribe = vi.fn((listener: (change: { keys?: readonly string[] }) => void) => {
      listener({ keys: ["beta-access"] })
      return detach
    })
    const detach = vi.fn(() => null)
    const flag = createFlags({
      cache: {
        delete: () => Promise.resolve(true),
        get: () => Promise.resolve(null),
        set: () => Promise.resolve(),
      },
      decide: () => ({ type: "boolean", value: true }),
      identify: () => ({ distinctId: "user123" }),
      subscribe,
    })
    const evaluator = flag({ defaultValue: false, key: "beta-access" })

    expect(await evaluator()).toBe(true)
    expect(await evaluator()).toBe(true)
    expect(subscribe).toHaveBeenCalledTimes(1)
    expect(detach).not.toHaveBeenCalled()
  })

  test("shares one provider subscription between invalidation and change listeners", async () => {
    let notify!: (change: { keys?: readonly string[] }) => void
    const detach = vi.fn(() => null)
    const subscribe = vi.fn((listener: typeof notify) => {
      notify = listener
      return detach
    })
    const cached = new Map<string, Decision>()
    const flag = createFlags({
      cache: {
        delete: (key) => Promise.resolve(cached.delete(key)),
        get: (key) => Promise.resolve(cached.get(key)),
        set: (key, value) => {
          cached.set(key, value)
          return Promise.resolve()
        },
      },
      decide: () => ({ type: "boolean", value: true }),
      identify: () => ({ distinctId: "user123" }),
      subscribe,
    })
    const evaluator = flag({ defaultValue: false, key: "beta-access" })
    const changed: Array<readonly string[] | undefined> = []

    const unsubscribe = flag.changes.subscribe((keys) => {
      changed.push(keys)
    })
    expect(await evaluator()).toBe(true)
    await flushBackground()
    expect(cached.size).toBe(1)
    expect(subscribe).toHaveBeenCalledTimes(1)

    notify({ keys: ["beta-access"] })
    await flushBackground()
    expect(cached.size).toBe(0)
    expect(changed).toEqual([["beta-access"]])

    unsubscribe()
    expect(detach).not.toHaveBeenCalled()
    expect(subscribe).toHaveBeenCalledTimes(1)
  })

  test("reports delete failures without failing invalidation", async () => {
    const reports: DecisionCacheErrorReport[] = []
    let notify!: (change: { keys?: readonly string[] }) => void
    const flag = createFlags({
      cache: {
        delete: () => Promise.reject(new Error("delete failed")),
        get: () => Promise.resolve(null),
        set: () => Promise.resolve(),
      },
      decide: () => ({ type: "boolean", value: true }),
      identify: () => ({ distinctId: "user123" }),
      onCacheError: (report) => void reports.push(report),
      subscribe: (listener) => {
        notify = listener
        return () => void notify
      },
    })

    expect(await flag({ defaultValue: false, key: "beta-access" })()).toBe(true)
    notify({ keys: ["beta-access"] })
    await flushBackground()
    expect(reports.map(({ operation }) => operation)).toContain("delete")
  })

  test("invalidates only notified flags and supports keyless invalidation", async () => {
    let notify!: (change: { keys?: readonly string[] }) => void
    const removed: string[] = []
    const store = {
      delete: (key: string) => {
        removed.push(key)
        return Promise.resolve(true)
      },
      get: () => Promise.resolve(null),
      set: () => Promise.resolve(),
    }
    const flag = createFlags({
      cache: store,
      decide: () => ({ type: "boolean", value: true }),
      identify: () => ({ distinctId: "user123" }),
      subscribe: (listener) => {
        notify = listener
        return () => void notify
      },
    })
    const first = flag({ defaultValue: false, key: "first" })
    const second = flag({ defaultValue: false, key: "second" })

    await first()
    await second()
    notify({ keys: ["first"] })
    await flushBackground()
    expect(removed).toHaveLength(1)
    expect(removed[0]).toContain("first")

    notify({})
    await flushBackground()
    expect(removed).toHaveLength(2)
    expect(removed[1]).toContain("second")
  })

  test("does not write a provider decision after its flag is invalidated", async () => {
    const provider = createDeferred<Decision>()
    const providerStarted = createDeferred<boolean>()
    const set = vi.fn(() => Promise.resolve())
    const decide = vi.fn(() => {
      providerStarted.resolve(true)
      return provider.promise
    })
    let notify!: (change: { keys?: readonly string[] }) => void
    const flag = createFlags({
      cache: {
        delete: () => Promise.resolve(true),
        get: () => Promise.resolve(null),
        set,
      },
      decide,
      identify: () => ({ distinctId: "user123" }),
      subscribe: (listener) => {
        notify = listener
        return () => void notify
      },
    })
    const evaluator = flag({ defaultValue: false, key: "beta-access" })

    const evaluation = evaluator()
    await providerStarted.promise
    notify({ keys: ["beta-access"] })
    provider.resolve({ type: "boolean", value: true })

    expect(await evaluation).toBe(true)
    await flushBackground()
    expect(set).not.toHaveBeenCalled()

    expect(await evaluator()).toBe(true)
    await flushBackground()
    expect(decide).toHaveBeenCalledTimes(2)
    expect(set).toHaveBeenCalledTimes(1)
  })

  test("does not restore a decision whose write was in flight during a change", async () => {
    const stored = new Map<string, Decision>()
    const write = createDeferred<null>()
    const writeStarted = createDeferred<null>()
    const { evaluator, provider } = changingFlag({
      delete: (key) => Promise.resolve(stored.delete(key)),
      get: (key) => Promise.resolve(stored.get(key)),
      set: async (key, value) => {
        writeStarted.resolve(null)
        await write.promise
        stored.set(key, value)
      },
    })

    expect(await evaluator()).toBe(true)
    await writeStarted.promise
    provider.value = false
    provider.notify({ keys: ["beta-access"] })
    await flushBackground()
    write.resolve(null)
    await flushBackground()

    expect(await evaluator()).toBe(false)
  })

  test("keeps a newer write when an older write finishes after a change", async () => {
    const stored = new Map<string, Decision>()
    const firstWrite = createDeferred<null>()
    const firstWriteStarted = createDeferred<null>()
    let writes = 0
    const { decide, evaluator, provider } = changingFlag({
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

    expect(await evaluator()).toBe(true)
    await firstWriteStarted.promise
    provider.value = false
    provider.notify({ keys: ["beta-access"] })
    expect(await evaluator()).toBe(false)
    firstWrite.resolve(null)
    await flushBackground()

    expect(await evaluator.details()).toMatchObject({ source: "cache", value: false })
    expect(decide).toHaveBeenCalledTimes(2)
  })

  test("does not read a decision while the delete for a change is in flight", async () => {
    const stored = new Map<string, Decision>()
    const deletion = createDeferred<null>()
    const { evaluator, provider } = changingFlag({
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

    expect(await evaluator()).toBe(true)
    await flushBackground()
    provider.value = false
    provider.notify({ keys: ["beta-access"] })

    expect(await evaluator()).toBe(false)
    deletion.resolve(null)
  })

  test("deletes a decision written after a read that spanned a change", async () => {
    const stored = new Map<string, Decision>()
    const firstRead = createDeferred<Decision | null>()
    const firstReadStarted = createDeferred<null>()
    const written = createDeferred<null>()
    let reads = 0
    const { decide, evaluator, provider } = changingFlag({
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

    const evaluation = evaluator()
    await firstReadStarted.promise
    provider.notify({ keys: ["beta-access"] })
    firstRead.resolve(null)
    expect(await evaluation).toBe(true)
    await written.promise
    expect(stored.size).toBe(1)

    provider.value = false
    provider.notify({ keys: ["beta-access"] })
    await flushBackground()

    expect(stored.size).toBe(0)
    expect(await evaluator.details()).toMatchObject({ source: "provider", value: false })
    expect(decide).toHaveBeenCalledTimes(2)
  })

  test("does not read or write the cache for an anonymous identity", async () => {
    const get = vi.fn(() => Promise.resolve<Decision | null>(null))
    const set = vi.fn(() => Promise.resolve())
    const flag = createFlags({
      anonymous: "allow",
      cache: { get, set },
      decide: () => ({ type: "boolean", value: true }),
      identify: () => null,
    })

    expect(await flag({ defaultValue: false, key: "beta-access" })()).toBe(true)
    await flushBackground()
    expect(get).not.toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
  })

  test("aborts while cache.get is pending", async () => {
    const pending = createDeferred<Decision | undefined>()
    const controller = new AbortController()
    const reason = new Error("caller stopped")
    const flag = createFlags({
      cache: { get: () => pending.promise, set: () => Promise.resolve() },
      decide: () => ({ type: "boolean", value: true }),
      identify: () => ({ distinctId: "user123" }),
    })
    const evaluation = flag({ defaultValue: false, key: "beta-access" }).details({
      signal: controller.signal,
    })

    await sleep(0)
    controller.abort(reason)
    expect(await evaluation).toEqual({
      error: reason,
      flagKey: "beta-access",
      source: "default",
      value: false,
    })
  })

  test("writes only once for a coalesced provider leader", async () => {
    const set = vi.fn(() => Promise.resolve())
    const decide = vi.fn(async () => {
      await sleep(5)
      return { type: "boolean", value: true } as const
    })
    const flag = createFlags({
      cache: { get: () => Promise.resolve(null), set },
      coalesce: true,
      decide,
      identify: () => ({ distinctId: "user123" }),
    })
    const evaluator = flag({ defaultValue: false, key: "beta-access" })

    expect(await Promise.all([evaluator(), evaluator()])).toEqual([true, true])
    await flushBackground()
    expect(decide).toHaveBeenCalledTimes(1)
    expect(set).toHaveBeenCalledTimes(1)
  })

  test("does not wait for a cache write", async () => {
    const write = createDeferred<null>()
    const flag = createFlags({
      cache: { get: () => Promise.resolve(null), set: async () => void (await write.promise) },
      decide: () => ({ type: "boolean", value: true }),
      identify: () => ({ distinctId: "user123" }),
    })

    expect(await flag({ defaultValue: false, key: "beta-access" })()).toBe(true)
    write.resolve(null)
  })
})

describe("request coalescing", () => {
  test("shares concurrent provider work for one evaluation key by default", async () => {
    const decide = vi.fn(async () => {
      await sleep(5)
      return { type: "boolean", value: true } as const
    })
    const flag = createFlags({
      decide,
      identify: () => ({ distinctId: "user123" }),
    })
    const evaluator = flag({ defaultValue: false, key: "beta-access" })

    expect(await Promise.all([evaluator(), evaluator(), evaluator()])).toEqual([true, true, true])
    expect(decide).toHaveBeenCalledTimes(1)
  })

  test("gives every evaluation its own provider call when coalescing is disabled", async () => {
    const decide = vi.fn(async () => {
      await sleep(5)
      return { type: "boolean", value: true } as const
    })
    const flag = createFlags({
      coalesce: false,
      decide,
      identify: () => ({ distinctId: "user123" }),
    })
    const evaluator = flag({ defaultValue: false, key: "beta-access" })

    expect(await Promise.all([evaluator(), evaluator(), evaluator()])).toEqual([true, true, true])
    expect(decide).toHaveBeenCalledTimes(3)
  })

  test("does not share provider work across factories built from one config object", async () => {
    const decide = vi.fn(async () => {
      await sleep(5)
      return { type: "boolean", value: true } as const
    })
    const config = {
      decide,
      identify: () => ({ distinctId: "user123" }),
    }
    const first = createFlags(config)({ defaultValue: false, key: "beta-access" })
    const second = createFlags(config)({ defaultValue: false, key: "beta-access" })

    expect(await Promise.all([first(), second()])).toEqual([true, true])
    expect(decide).toHaveBeenCalledTimes(2)
  })

  test("does not share provider work across incompatible flag shapes", async () => {
    const decide = vi.fn(async () => {
      await sleep(5)
      return { type: "boolean", value: true } as const
    })
    const flag = createFlags({
      coalesce: true,
      decide,
      identify: () => ({ distinctId: "user123" }),
    })
    const booleanFlag = flag({ defaultValue: false, key: "shared" })
    const variantFlag = flag({ defaultValue: "a", key: "shared", variants: ["a", "b"] })

    await Promise.all([booleanFlag(), variantFlag()])
    expect(decide).toHaveBeenCalledTimes(2)
  })

  test("supports an identity-sensitive coalescing key", async () => {
    const decide = vi.fn(async () => {
      await sleep(5)
      return { type: "boolean", value: true } as const
    })
    const flag = createFlags<{ distinctId: string; tenant: string }>({
      coalesce: true,
      decide,
      evaluationKey: (context) => `${context.identity?.tenant}:${context.flagKey}`,
      identify: () => ({ distinctId: "user123", tenant: "unused" }),
    })
    const evaluator = flag({ defaultValue: false, key: "beta-access" })

    await Promise.all([
      evaluator({ identity: { distinctId: "user123", tenant: "first" } }),
      evaluator({ identity: { distinctId: "user123", tenant: "second" } }),
    ])
    expect(decide).toHaveBeenCalledTimes(2)
  })

  test("does not cancel the leader when a follower aborts", async () => {
    const provider = createDeferred<Decision>()
    const controller = new AbortController()
    const flag = createFlags({
      coalesce: true,
      decide: () => provider.promise,
      identify: () => ({ distinctId: "user123" }),
    })
    const evaluator = flag({ defaultValue: false, key: "beta-access" })
    const leader = evaluator()
    await sleep(0)
    const follower = evaluator.details({ signal: controller.signal })
    await sleep(0)

    controller.abort(new Error("follower stopped"))
    provider.resolve({ type: "boolean", value: true })

    expect(await leader).toBe(true)
    const followerDetails = await follower
    expect(followerDetails.source).toBe("default")
    expect(followerDetails.error?.message).toBe("follower stopped")
  })

  test("keeps the shared provider call for a follower when the leader cancels", async () => {
    const provider = createDeferred<Decision>()
    const providerSignal = createDeferred<AbortSignal | undefined>()
    const decide = vi.fn((_key: string, _identity: unknown, options?: { signal?: AbortSignal }) => {
      providerSignal.resolve(options?.signal)
      return provider.promise
    })
    const followerJoined = createDeferred<null>()
    let keyReads = 0
    const flag = createFlags({
      decide,
      // The second key read is the follower's, in the same synchronous step as its join.
      evaluationKey: (context) => {
        keyReads += 1
        if (keyReads === 2) followerJoined.resolve(null)
        return context.flagKey
      },
      identify: () => ({ distinctId: "user123" }),
    })
    const evaluator = flag({ defaultValue: false, key: "beta-access" })
    const controller = new AbortController()
    const reason = new Error("leader stopped")

    const leader = evaluator.details({ signal: controller.signal })
    const signal = await providerSignal.promise
    const follower = evaluator.details()
    await followerJoined.promise
    controller.abort(reason)
    provider.resolve({ type: "boolean", value: true })

    expect(await leader).toEqual({
      error: reason,
      flagKey: "beta-access",
      source: "default",
      value: false,
    })
    expect(await follower).toEqual({ flagKey: "beta-access", source: "provider", value: true })
    expect(signal?.aborted).toBe(false)
    expect(decide).toHaveBeenCalledTimes(1)
  })

  test("keeps the shared provider call for a follower with a later deadline", async () => {
    vi.useFakeTimers()
    try {
      const provider = createDeferred<Decision>()
      const providerStarted = createDeferred<null>()
      const decide = vi.fn(
        (_key: string, _identity: unknown, options?: { signal?: AbortSignal }) => {
          providerStarted.resolve(null)
          return new Promise<Decision>((resolve, reject) => {
            options?.signal?.addEventListener("abort", () => {
              reject(new Error("provider stopped"))
            })
            void provider.promise.then(resolve)
          })
        }
      )
      const followerJoined = createDeferred<null>()
      let keyReads = 0
      const flag = createFlags({
        decide,
        evaluationKey: (context) => {
          keyReads += 1
          if (keyReads === 2) followerJoined.resolve(null)
          return context.flagKey
        },
        identify: () => ({ distinctId: "user123" }),
      })
      const fast = flag({ defaultValue: false, key: "beta-access", timeoutMs: 10 })
      const slow = flag({ defaultValue: false, key: "beta-access", timeoutMs: 1000 })

      const leader = fast.details()
      await providerStarted.promise
      const follower = slow.details()
      await followerJoined.promise
      await vi.advanceTimersByTimeAsync(10)
      const leaderDetails = await leader
      expect(leaderDetails.source).toBe("default")
      expect(leaderDetails.error).toBeInstanceOf(FlagTimeoutError)

      provider.resolve({ type: "boolean", value: true })
      expect(await follower).toEqual({ flagKey: "beta-access", source: "provider", value: true })
      expect(decide).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  test("cancels the shared provider call once every caller has cancelled", async () => {
    const providerSignal = createDeferred<AbortSignal | undefined>()
    const decide = vi.fn(
      (
        _key: string,
        _identity: unknown,
        options?: { signal?: AbortSignal }
      ): Decision | Promise<Decision> => {
        if (decide.mock.calls.length > 1) {
          return { type: "boolean", value: true }
        }
        providerSignal.resolve(options?.signal)
        return createDeferred<Decision>().promise
      }
    )
    const followerJoined = createDeferred<null>()
    let keyReads = 0
    const flag = createFlags({
      decide,
      evaluationKey: (context) => {
        keyReads += 1
        if (keyReads === 2) followerJoined.resolve(null)
        return context.flagKey
      },
      identify: () => ({ distinctId: "user123" }),
    })
    const evaluator = flag({ defaultValue: false, key: "beta-access" })
    const leaderController = new AbortController()
    const followerController = new AbortController()

    const leader = evaluator.details({ signal: leaderController.signal })
    const signal = await providerSignal.promise
    const follower = evaluator.details({ signal: followerController.signal })
    await followerJoined.promise

    leaderController.abort(new Error("leader stopped"))
    expect(signal?.aborted).toBe(false)
    followerController.abort(new Error("follower stopped"))
    expect(signal?.aborted).toBe(true)

    const [leaderDetails, followerDetails] = await Promise.all([leader, follower])
    expect(leaderDetails.source).toBe("default")
    expect(followerDetails.source).toBe("default")
    expect(await evaluator()).toBe(true)
    expect(decide).toHaveBeenCalledTimes(2)
  })

  test("keeps a batch's shared provider call for an outside follower when the batch cancels", async () => {
    const batchProvider = createDeferred<Record<string, Decision>>()
    const providerSignal = createDeferred<AbortSignal | undefined>()
    const decideMany = vi.fn(
      (_keys: readonly string[], _identity: unknown, options?: { signal?: AbortSignal }) => {
        providerSignal.resolve(options?.signal)
        return batchProvider.promise
      }
    )
    const followerJoined = createDeferred<null>()
    let keyReads = 0
    const flag = createFlags({
      decide: () => ({ type: "boolean", value: false }),
      decideMany,
      evaluationKey: (context) => {
        keyReads += 1
        if (keyReads === 2) followerJoined.resolve(null)
        return context.flagKey
      },
      identify: () => ({ distinctId: "user123" }),
    })
    const evaluator = flag({ defaultValue: false, key: "beta-access" })
    const controller = new AbortController()

    const batch = flag.batch([evaluator], { signal: controller.signal })
    const signal = await providerSignal.promise
    const follower = evaluator.details()
    await followerJoined.promise
    controller.abort(new Error("batch stopped"))
    const batchResult = await batch
    expect(batchResult.details(evaluator).source).toBe("default")
    expect(signal?.aborted).toBe(false)
    batchProvider.resolve({ "beta-access": { type: "boolean", value: true } })

    expect(await follower).toEqual({ flagKey: "beta-access", source: "provider", value: true })
    expect(decideMany).toHaveBeenCalledTimes(1)
  })

  test("does not coalesce onto in-flight provider work after invalidation", async () => {
    const first = createDeferred<Decision>()
    let notifyChange: ((change: { keys?: readonly string[] }) => void) | undefined
    const decide = vi.fn((): Decision | Promise<Decision> =>
      decide.mock.calls.length === 1 ? first.promise : { type: "boolean", value: false }
    )
    const flag = createFlags({
      cache: {
        delete: () => Promise.resolve(true),
        get: () => Promise.resolve(null),
        set: () => Promise.resolve(),
      },
      coalesce: true,
      decide,
      identify: () => ({ distinctId: "user123" }),
      subscribe: (notify) => {
        notifyChange = notify
        return () => null
      },
    })
    const evaluator = flag({ defaultValue: true, key: "beta-access" })

    const leader = evaluator()
    await sleep(0)
    notifyChange?.({ keys: ["beta-access"] })
    const late = evaluator()
    await sleep(0)

    first.resolve({ type: "boolean", value: true })
    expect(await leader).toBe(true)
    expect(await late).toBe(false)
    expect(decide).toHaveBeenCalledTimes(2)
  })

  test("drops in-flight provider work on invalidation without a cache store", async () => {
    const first = createDeferred<Decision>()
    let notifyChange: ((change: { keys?: readonly string[] }) => void) | undefined
    const decide = vi.fn((): Decision | Promise<Decision> =>
      decide.mock.calls.length === 1 ? first.promise : { type: "boolean", value: false }
    )
    const flag = createFlags({
      decide,
      identify: () => ({ distinctId: "user123" }),
      subscribe: (notify) => {
        notifyChange = notify
        return () => null
      },
    })
    const evaluator = flag({ defaultValue: true, key: "beta-access" })

    const leader = evaluator()
    await sleep(0)
    notifyChange?.({ keys: ["beta-access"] })
    const late = evaluator()
    await sleep(0)

    first.resolve({ type: "boolean", value: true })
    expect(await leader).toBe(true)
    expect(await late).toBe(false)
    expect(decide).toHaveBeenCalledTimes(2)
  })

  test("drops in-flight provider work on invalidation when the cache store cannot delete", async () => {
    const first = createDeferred<Decision>()
    let notifyChange: ((change: { keys?: readonly string[] }) => void) | undefined
    const decide = vi.fn((): Decision | Promise<Decision> =>
      decide.mock.calls.length === 1 ? first.promise : { type: "boolean", value: false }
    )
    const flag = createFlags({
      cache: {
        get: () => Promise.resolve(null),
        set: () => Promise.resolve(),
      },
      decide,
      identify: () => ({ distinctId: "user123" }),
      subscribe: (notify) => {
        notifyChange = notify
        return () => null
      },
    })
    const evaluator = flag({ defaultValue: true, key: "beta-access" })

    const leader = evaluator()
    await sleep(0)
    notifyChange?.({ keys: ["beta-access"] })
    const late = evaluator()
    await sleep(0)

    first.resolve({ type: "boolean", value: true })
    expect(await leader).toBe(true)
    expect(await late).toBe(false)
    expect(decide).toHaveBeenCalledTimes(2)
  })

  test("does not write a pre-change decision into a store that cannot delete", async () => {
    const first = createDeferred<Decision>()
    const store = new Map<string, Decision>()
    let notifyChange: ((change: { keys?: readonly string[] }) => void) | undefined
    const decide = vi.fn((): Decision | Promise<Decision> =>
      decide.mock.calls.length === 1 ? first.promise : { type: "boolean", value: false }
    )
    const flag = createFlags({
      cache: {
        get: (key) => Promise.resolve(store.get(key) ?? null),
        set: (key, decision) => {
          store.set(key, decision)
          return Promise.resolve()
        },
      },
      decide,
      identify: () => ({ distinctId: "user123" }),
      subscribe: (notify) => {
        notifyChange = notify
        return () => null
      },
    })
    const evaluator = flag({ defaultValue: true, key: "beta-access" })

    const leader = evaluator()
    await sleep(0)
    notifyChange?.({ keys: ["beta-access"] })
    const late = evaluator()
    await sleep(0)

    first.resolve({ type: "boolean", value: true })
    expect(await leader).toBe(true)
    expect(await late).toBe(false)
    await flushBackground()
    expect(await evaluator()).toBe(false)
  })

  test("degrades softly when subscribe throws instead of poisoning coalescing", async () => {
    const reports: DecisionCacheErrorReport[] = []
    const flag = createFlags({
      decide: () => ({ type: "boolean", value: true }),
      identify: () => ({ distinctId: "user123" }),
      onCacheError: (report) => void reports.push(report),
      subscribe: () => {
        throw new Error("subscribe failed")
      },
    })
    const evaluator = flag({ defaultValue: false, key: "beta-access" })

    expect(await evaluator()).toBe(true)
    expect(await evaluator()).toBe(true)
    await flushBackground()
    expect(reports.length).toBeGreaterThanOrEqual(1)
    expect(reports[0]).toMatchObject({
      error: new Error("subscribe failed"),
      flagKey: "beta-access",
      operation: "subscribe",
    })
  })

  test("rejects every follower with the normalized leader failure and permits a retry", async () => {
    const provider = createDeferred<Decision>()
    const decide = vi.fn(() => provider.promise)
    const flag = createFlags({
      coalesce: true,
      decide,
      identify: () => ({ distinctId: "user123" }),
    })
    const evaluator = flag({ defaultValue: false, key: "beta-access" })
    const evaluations = [evaluator.details(), evaluator.details(), evaluator.details()]
    await sleep(0)

    provider.reject({ code: "unavailable" } as never)

    const details = await Promise.all(evaluations)
    expect(decide).toHaveBeenCalledTimes(1)
    expect(details.map((result) => result.source)).toEqual(["default", "default", "default"])
    expect(details.map((result) => result.error?.message)).toEqual([
      '{"code":"unavailable"}',
      '{"code":"unavailable"}',
      '{"code":"unavailable"}',
    ])

    decide.mockImplementation(() => Promise.resolve({ type: "boolean", value: true }))
    expect(await evaluator()).toBe(true)
    expect(decide).toHaveBeenCalledTimes(2)
  })
})

describe("timeouts and fallback", () => {
  test("returns the default and reports a timeout", async () => {
    const flag = createFlags({
      decide: () =>
        new Promise<Decision>((_resolve) => {
          void _resolve
        }),
      identify: () => ({ distinctId: "user123" }),
      timeoutMs: 5,
    })

    const details = await flag({ defaultValue: false, key: "beta-access" }).details()
    expect(details.source).toBe("default")
    expect(details.error).toBeInstanceOf(FlagTimeoutError)
  })
})
