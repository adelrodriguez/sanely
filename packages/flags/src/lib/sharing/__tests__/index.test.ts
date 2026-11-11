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

function createContext(identity: Subject | null = user): EvaluationContext {
  return { flag: betaAccess, identity, signal: new AbortController().signal }
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
  const changes =
    subscribe
    && createChangeBroadcaster(subscribe, (error) => {
      onError({ _tag: "SubscribeFailed", error })
    })
  return createSharing(options, "test", changes, onError)
}

type StoreFunctions = {
  delete: (key: string) => Promise<unknown>
  deleteFlags: (flagKeys?: readonly string[]) => Promise<unknown>
  get: (key: string) => Promise<Decision | null | undefined>
  set: (key: string, decision: Decision) => Promise<void>
}

function createStore(overrides: Partial<StoreFunctions> = {}) {
  const decisions = new Map<string, Decision>()
  return {
    delete: vi.fn(overrides.delete ?? ((key: string) => Promise.resolve(decisions.delete(key)))),
    deleteFlags: vi.fn(
      overrides.deleteFlags
        ?? (() => {
          decisions.clear()
          return Promise.resolve()
        })
    ),
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

const signal = () => new AbortController().signal

describe("resolveDecision", () => {
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
      signal(),
      false
    )
    changes.notify(["beta-access"])
    expect(config.state.pending.size).toBe(0)

    const secondLeader = resolveDecision(
      config,
      context,
      betaAccess,
      () => secondRequest.promise,
      signal(),
      false
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
      signal(),
      false
    )
    changes.notify(["other"])
    expect(config.state.pending.size).toBe(1)
    request.resolve(trueDecision)
    await pending
  })

  test("validates the provider decision on every path", async () => {
    const variantDecision = { type: "variant", variant: "dark" }
    const direct = createConfig({ coalesce: false })
    const coalesced = createConfig()

    await expect(
      resolveDecision(
        direct,
        createContext(anonymous),
        betaAccess,
        () => variantDecision,
        signal(),
        false
      )
    ).rejects.toBeInstanceOf(InvalidDecisionError)
    await expect(
      resolveDecision(
        createConfig({ coalesce: false, store: createStore() }),
        createContext(),
        betaAccess,
        () => variantDecision,
        signal(),
        false
      )
    ).rejects.toBeInstanceOf(InvalidDecisionError)
    await expect(
      resolveDecision(
        coalesced,
        createContext(),
        betaAccess,
        () => variantDecision,
        signal(),
        false
      )
    ).rejects.toBeInstanceOf(InvalidDecisionError)
  })

  test("reports a failing store write and delete", async () => {
    const onError = vi.fn()
    const store = createStore({
      delete: () => Promise.reject(new Error("delete failed")),
      get: () => Promise.resolve({ type: "variant", variant: "x" }),
      set: () => Promise.reject(new Error("set failed")),
    })
    const config = createConfig({ store }, undefined, onError)

    await resolveDecision(config, createContext(), betaAccess, () => trueDecision, signal(), false)
    await sleep(0)
    await sleep(0)

    const operations = onError.mock.calls.map(
      ([report]) => (report as { operation: string }).operation
    )
    expect(operations).toEqual(expect.arrayContaining(["validate", "delete", "set"]))
  })

  test("keeps the stored decisions of flags that a change does not name", async () => {
    const changes = createProvider()
    const store = createStore({ deleteFlags: vi.fn(() => Promise.resolve()) })
    const config = createConfig({ store }, changes.subscribe)

    await resolveDecision(config, createContext(), betaAccess, () => trueDecision, signal(), false)
    await sleep(0)
    changes.notify(["other"])
    await sleep(0)

    expect(store.deleteFlags).toHaveBeenCalledWith(["other"])
    const again = await resolveDecision(
      config,
      createContext(),
      betaAccess,
      () => falseDecision,
      signal(),
      false
    )
    expect(again.source).toBe("cache")
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

    await resolveDecision(config, createContext(), betaAccess, () => trueDecision, signal(), false)
    await sleep(0)
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ _tag: "SubscribeFailed", error: expect.any(Error) })
    )
    expect(config.state.subscription.registered).toBe(true)

    await resolveDecision(config, createContext(), betaAccess, () => trueDecision, signal(), false)
    expect(subscribe).toHaveBeenCalledTimes(2)
    await resolveDecision(config, createContext(), betaAccess, () => trueDecision, signal(), false)
    expect(subscribe).toHaveBeenCalledTimes(2)
  })
})
