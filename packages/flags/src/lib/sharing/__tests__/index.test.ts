import { setTimeout as sleep } from "node:timers/promises"
import { describe, expect, test, vi } from "vitest"
import type { Decision } from "#lib/definition/decision.ts"
import type { EvaluationContext, Identity, Subject } from "#lib/identity/index.ts"
import { createChangeBroadcaster, type ChangeListener } from "#lib/changes/index.ts"
import { flag } from "#lib/definition/index.ts"
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
    const removal = Promise.withResolvers<null>()
    const store = createStore({ deleteFlags: vi.fn(() => removal.promise) })
    const config = createConfig({ store }, changes.subscribe)

    await resolveDecision(config, createContext(), betaAccess, () => trueDecision, signal(), false)
    await sleep(0)
    changes.notify(["other"])
    await sleep(0)

    expect(store.deleteFlags).toHaveBeenCalledWith(["other"])
    // The delete for "other" is still pending, and beta-access still reads the store.
    const again = await resolveDecision(
      config,
      createContext(),
      betaAccess,
      () => falseDecision,
      signal(),
      false
    )
    expect(again.source).toBe("cache")
    removal.resolve(null)
  })
})
