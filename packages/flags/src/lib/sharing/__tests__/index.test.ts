import { setTimeout as sleep } from "node:timers/promises"
import { describe, expect, test, vi } from "vitest"
import type { Decision } from "#lib/definition/decision.ts"
import { createChangeBroadcaster, type ChangeListener } from "#lib/changes/index.ts"
import { flag } from "#lib/definition/index.ts"
import { InvalidDecisionError } from "#lib/errors/index.ts"
import {
  anonymous,
  type EvaluationContext,
  type Identity,
  type Subject,
} from "#lib/identity/index.ts"
import {
  createSharing,
  type CacheOptions,
  resolveDecision,
  type Sharing,
} from "#lib/sharing/index.ts"

const trueDecision: Decision = { type: "boolean", value: true }
const falseDecision: Decision = { type: "boolean", value: false }
const betaAccess = flag.boolean("beta-access", false)

const user: Identity = { distinctId: "user123" }
// A reader without provider changes or an error callback.
const detached = { changes: undefined, onError: undefined, options: undefined }

function createContext(identity: Subject | null = user): EvaluationContext {
  return { flag: betaAccess, identity, signal: new AbortController().signal }
}

function customKey(): string {
  return "k"
}

function createProvider() {
  let notify: ChangeListener | undefined
  const subscribe = vi.fn((listener: ChangeListener) => {
    notify = listener
    return () => null
  })
  return {
    notify: (keys?: readonly string[]) => notify?.(keys),
    subscribe,
  }
}

function createConfig(
  options: CacheOptions<Subject> = {},
  subscribe?: (notify: ChangeListener) => () => void,
  onError = vi.fn()
): Sharing<Subject> {
  return createSharing(options, subscribe && createChangeBroadcaster(subscribe), onError)
}

type StoreFunctions = {
  delete: (key: string) => Promise<unknown>
  get: (key: string) => Promise<Decision | null | undefined>
  set: (key: string, decision: Decision) => Promise<void>
}

function createStore(overrides: Partial<StoreFunctions> = {}) {
  const decisions = new Map<string, Decision>()
  return {
    delete: vi.fn(overrides.delete ?? ((key: string) => Promise.resolve(decisions.delete(key)))),
    get: vi.fn(overrides.get ?? ((key: string) => Promise.resolve(decisions.get(key)))),
    set: vi.fn(
      overrides.set
        ?? ((key: string, decision: Decision) => {
          decisions.set(key, decision)
          return Promise.resolve()
        })
    ),
  }
}

async function expectRejection(promise: Promise<unknown>, message: string): Promise<void> {
  await expect(promise).rejects.toHaveProperty("message", message)
}

const signal = () => new AbortController().signal

describe("createSharing", () => {
  test("coalesces by default and keeps the options", () => {
    const store = createStore()
    const key = customKey

    expect(createSharing(detached.options, detached.changes, detached.onError)).toMatchObject({
      coalesce: true,
      key: undefined,
      store: undefined,
    })
    expect(
      createSharing({ coalesce: false, key, store }, detached.changes, detached.onError)
    ).toMatchObject({
      coalesce: false,
      key,
      store,
    })
  })
})

describe("resolveDecision", () => {
  test("shares the leader decision with followers and empties pending after settle", async () => {
    const config = createConfig()
    const context = createContext()
    const request = Promise.withResolvers<Decision>()
    const provider = vi.fn(() => request.promise)

    const leader = resolveDecision(config, context, betaAccess, provider, signal())
    const follower = resolveDecision(config, context, betaAccess, provider, signal())
    expect(config.state.pending.size).toBe(1)
    request.resolve(trueDecision)

    const results = await Promise.all([leader, follower])
    expect(results.map((result) => result.decision)).toEqual([trueDecision, trueDecision])
    expect(provider).toHaveBeenCalledTimes(1)
    expect(config.state.pending.size).toBe(0)
  })

  test("rejects followers with the leader error and empties pending", async () => {
    const config = createConfig()
    const context = createContext()
    const request = Promise.withResolvers<Decision>()
    const provider = vi.fn(() => request.promise)

    const leader = expectRejection(
      resolveDecision(config, context, betaAccess, provider, signal()),
      "Provider failed"
    )
    const follower = expectRejection(
      resolveDecision(config, context, betaAccess, provider, signal()),
      "Provider failed"
    )
    await sleep(0)
    request.reject(new Error("Provider failed"))

    await Promise.all([leader, follower])
    expect(provider).toHaveBeenCalledTimes(1)
    expect(config.state.pending.size).toBe(0)
  })

  test("keeps a follower abort independent from the leader", async () => {
    const config = createConfig()
    const context = createContext()
    const request = Promise.withResolvers<Decision>()
    const provider = vi.fn(() => request.promise)
    const aborted = new AbortController()
    aborted.abort(new Error("Follower aborted"))

    const leader = resolveDecision(config, context, betaAccess, provider, signal())
    const follower = resolveDecision(config, context, betaAccess, provider, aborted.signal)

    await expectRejection(follower, "Follower aborted")
    request.resolve(trueDecision)
    const settled = await leader
    expect(settled.decision).toEqual(trueDecision)
    expect(provider).toHaveBeenCalledTimes(1)
    expect(config.state.pending.size).toBe(0)
  })

  test("does not remove a newer leader when a replaced leader settles", async () => {
    const changes = createProvider()
    const config = createConfig({}, changes.subscribe)
    const context = createContext()
    const firstRequest = Promise.withResolvers<Decision>()
    const secondRequest = Promise.withResolvers<Decision>()

    const firstLeader = resolveDecision(
      config,
      context,
      betaAccess,
      () => firstRequest.promise,
      signal()
    )
    changes.notify(["beta-access"])
    expect(config.state.pending.size).toBe(0)

    const secondLeader = resolveDecision(
      config,
      context,
      betaAccess,
      () => secondRequest.promise,
      signal()
    )
    expect(config.state.pending.size).toBe(1)

    firstRequest.resolve(trueDecision)
    await firstLeader
    expect(config.state.pending.size).toBe(1)

    secondRequest.resolve(falseDecision)
    const second = await secondLeader
    expect(second.decision).toEqual(falseDecision)
    expect(config.state.pending.size).toBe(0)
  })

  test("keeps a pending call for another flag when a change names other flags", async () => {
    const changes = createProvider()
    const config = createConfig({}, changes.subscribe)
    const request = Promise.withResolvers<Decision>()

    const pending = resolveDecision(
      config,
      createContext(),
      betaAccess,
      () => request.promise,
      signal()
    )
    changes.notify(["other"])
    expect(config.state.pending.size).toBe(1)
    request.resolve(trueDecision)
    await pending
  })

  test("calls the provider directly without a store and without coalescing", async () => {
    const config = createConfig({ coalesce: false })
    const provider = vi.fn(() => trueDecision)

    await resolveDecision(config, createContext(), betaAccess, provider, signal())
    await resolveDecision(config, createContext(), betaAccess, provider, signal())

    expect(provider).toHaveBeenCalledTimes(2)
    expect(config.state.pending.size).toBe(0)
  })

  test("never shares an anonymous evaluation", async () => {
    const store = createStore()
    const config = createConfig({ store })
    const provider = vi.fn(() => trueDecision)

    const results = await Promise.all([
      resolveDecision(config, createContext(anonymous), betaAccess, provider, signal()),
      resolveDecision(config, createContext(anonymous), betaAccess, provider, signal()),
    ])

    expect(results.map((result) => result.source)).toEqual(["provider", "provider"])
    expect(provider).toHaveBeenCalledTimes(2)
    expect(store.get).not.toHaveBeenCalled()
  })

  test("validates the provider decision on every path", async () => {
    const variantDecision = { type: "variant", variant: "dark" }
    const direct = createConfig({ coalesce: false })
    const coalesced = createConfig()

    await expect(
      resolveDecision(direct, createContext(anonymous), betaAccess, () => variantDecision, signal())
    ).rejects.toBeInstanceOf(InvalidDecisionError)
    await expect(
      resolveDecision(
        createConfig({ coalesce: false, store: createStore() }),
        createContext(),
        betaAccess,
        () => variantDecision,
        signal()
      )
    ).rejects.toBeInstanceOf(InvalidDecisionError)
    await expect(
      resolveDecision(coalesced, createContext(), betaAccess, () => variantDecision, signal())
    ).rejects.toBeInstanceOf(InvalidDecisionError)
  })

  test("reads a stored decision and writes the provider decision through", async () => {
    const store = createStore()
    const config = createConfig({ store })
    const provider = vi.fn(() => trueDecision)

    const first = await resolveDecision(config, createContext(), betaAccess, provider, signal())
    await sleep(0)
    const second = await resolveDecision(config, createContext(), betaAccess, provider, signal())

    expect(first.source).toBe("provider")
    expect(second).toEqual({ decision: trueDecision, source: "cache" })
    expect(provider).toHaveBeenCalledTimes(1)
    expect(store.set).toHaveBeenCalledTimes(1)
  })

  test("writes through without coalescing", async () => {
    const store = createStore()
    const config = createConfig({ coalesce: false, store })

    await resolveDecision(config, createContext(), betaAccess, () => trueDecision, signal())
    await sleep(0)

    expect(store.set).toHaveBeenCalledTimes(1)
  })

  test("reports a failing store read and continues with the provider", async () => {
    const onError = vi.fn()
    const store = createStore({ get: () => Promise.reject(new Error("get failed")) })
    const config = createConfig({ store }, undefined, onError)

    const resolution = await resolveDecision(
      config,
      createContext(),
      betaAccess,
      () => trueDecision,
      signal()
    )
    await sleep(0)

    expect(resolution.source).toBe("provider")
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        _tag: "StoreFailed",
        flagKey: "beta-access",
        identity: { distinctId: "user123" },
        operation: "get",
      })
    )
  })

  test("reports and deletes a stored decision that does not fit the flag", async () => {
    const onError = vi.fn()
    const store = createStore({ get: () => Promise.resolve({ type: "variant", variant: "x" }) })
    const config = createConfig({ store }, undefined, onError)

    const resolution = await resolveDecision(
      config,
      createContext(),
      betaAccess,
      () => trueDecision,
      signal()
    )
    await sleep(0)

    expect(resolution.source).toBe("provider")
    expect(store.delete).toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ operation: "validate" }))
  })

  test("reports a failing store write and delete", async () => {
    const onError = vi.fn()
    const store = createStore({
      delete: () => Promise.reject(new Error("delete failed")),
      get: () => Promise.resolve({ type: "variant", variant: "x" }),
      set: () => Promise.reject(new Error("set failed")),
    })
    const config = createConfig({ store }, undefined, onError)

    await resolveDecision(config, createContext(), betaAccess, () => trueDecision, signal())
    await sleep(0)
    await sleep(0)

    const operations = onError.mock.calls.map(
      ([report]) => (report as { operation: string }).operation
    )
    expect(operations).toEqual(expect.arrayContaining(["validate", "delete", "set"]))
  })

  test("skips the store when no delete method exists", async () => {
    const onError = vi.fn()
    const { delete: _delete, ...withoutDelete } = createStore({
      get: () => Promise.resolve({ type: "variant", variant: "x" }),
    })
    const config = createConfig({ store: withoutDelete }, createProvider().subscribe, onError)

    const resolution = await resolveDecision(
      config,
      createContext(),
      betaAccess,
      () => trueDecision,
      signal()
    )

    expect(resolution.source).toBe("provider")
    expect(config.state.keysByFlag.size).toBe(0)
  })

  test("reports a failing key function and calls the provider directly", async () => {
    const onError = vi.fn()
    const store = createStore()
    const config = createConfig(
      {
        key: () => {
          throw new Error("key failed")
        },
        store,
      },
      undefined,
      onError
    )

    const resolution = await resolveDecision(
      config,
      createContext(),
      betaAccess,
      () => trueDecision,
      signal()
    )
    await sleep(0)

    expect(resolution.source).toBe("provider")
    expect(store.get).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ _tag: "StoreFailed", key: "beta-access", operation: "key" })
    )
  })

  test("skips a cache write when invalidation advances after the read", async () => {
    const changes = createProvider()
    const store = createStore()
    const config = createConfig({ store }, changes.subscribe)
    const request = Promise.withResolvers<Decision>()

    const resolution = resolveDecision(
      config,
      createContext(),
      betaAccess,
      () => request.promise,
      signal()
    )
    await sleep(0)
    changes.notify(["beta-access"])
    request.resolve(trueDecision)

    const settled = await resolution
    expect(settled.source).toBe("provider")
    await sleep(0)
    expect(store.set).not.toHaveBeenCalled()
  })

  test("deletes the stored decisions of changed flags", async () => {
    const changes = createProvider()
    const store = createStore()
    const config = createConfig({ store }, changes.subscribe)

    await resolveDecision(config, createContext(user), betaAccess, () => trueDecision, signal())
    await sleep(0)
    expect(config.state.keysByFlag.get("beta-access")?.size).toBe(1)

    changes.notify()
    await sleep(0)

    expect(store.delete).toHaveBeenCalledTimes(1)
    expect(config.state.keysByFlag.size).toBe(0)
    const again = await resolveDecision(
      config,
      createContext(user),
      betaAccess,
      () => falseDecision,
      signal()
    )
    expect(again).toEqual({ decision: falseDecision, source: "provider" })
  })

  test("skips the store read while a delete for the key is pending", async () => {
    const changes = createProvider()
    const deleted = Promise.withResolvers<boolean>()
    const store = createStore({ delete: vi.fn(() => deleted.promise) })
    const config = createConfig({ store }, changes.subscribe)

    await resolveDecision(config, createContext(), betaAccess, () => trueDecision, signal())
    await sleep(0)
    changes.notify(["beta-access"])
    await sleep(0)
    store.get.mockClear()

    const resolution = await resolveDecision(
      config,
      createContext(),
      betaAccess,
      () => falseDecision,
      signal()
    )

    expect(resolution.source).toBe("provider")
    expect(store.get).not.toHaveBeenCalled()
    deleted.resolve(true)
  })

  test("ignores a change for a flag without stored keys", async () => {
    const changes = createProvider()
    const store = createStore()
    const config = createConfig({ store }, changes.subscribe)

    await resolveDecision(config, createContext(), betaAccess, () => trueDecision, signal())
    changes.notify(["other"])
    await sleep(0)

    expect(store.delete).not.toHaveBeenCalled()
  })

  test("reports a failing subscribe and retries on the next evaluation", async () => {
    const onError = vi.fn()
    const subscribe = vi
      .fn<(notify: ChangeListener) => () => void>()
      .mockImplementationOnce(() => {
        throw new Error("subscribe failed")
      })
      .mockImplementation(() => () => null)
    const config = createConfig({}, subscribe, onError)

    await resolveDecision(config, createContext(), betaAccess, () => trueDecision, signal())
    await sleep(0)
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ _tag: "SubscribeFailed", error: expect.any(Error) })
    )
    expect(config.state.subscription.attached).toBe(false)

    await resolveDecision(config, createContext(), betaAccess, () => trueDecision, signal())
    expect(subscribe).toHaveBeenCalledTimes(2)
    expect(config.state.subscription.attached).toBe(true)
  })
})
