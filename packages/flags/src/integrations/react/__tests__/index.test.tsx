// @vitest-environment happy-dom

import { setTimeout as sleep } from "node:timers/promises"
import { act, cleanup, render, screen } from "@testing-library/react"
import { Component, type ReactNode, Suspense } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createFlags, type DecisionCacheErrorReport, decision } from "#index.ts"
import {
  createFlagCache,
  createFlagHooks,
  FeatureFlag,
  FlagProvider,
  useFlag,
  useFlagBatch,
  useFlagCache,
} from "#integrations/react/index.tsx"

afterEach(cleanup)

function makeFactory() {
  const decide = vi.fn((key: string) =>
    key === "theme" ? decision.variant("dark", { experiment: "A" }) : decision.boolean(true)
  )
  const decideMany = vi.fn((keys: readonly string[]) =>
    Object.fromEntries(
      keys.map((key) => [key, key === "theme" ? decision.variant("dark") : decision.boolean(true)])
    )
  )
  const factory = createFlags({
    decide,
    decideMany,
    identify: () => ({ distinctId: "default" }),
  })
  return { decide, decideMany, factory }
}

function changingFactory() {
  const provider = {
    emit: (_keys?: readonly string[]): void => undefined,
    value: true,
  }
  const decide = vi.fn(() => decision.boolean(provider.value))
  const decideMany = vi.fn((keys: readonly string[]) =>
    Object.fromEntries(keys.map((key) => [key, decision.boolean(provider.value)]))
  )
  const factory = createFlags({
    decide,
    decideMany,
    identify: () => ({ distinctId: "core" }),
    subscribe: (notify) => {
      provider.emit = (keys) => {
        notify(keys === undefined ? {} : { keys })
      }
      return () => null
    },
  })
  return { decide, decideMany, factory, provider }
}

// A factory whose `subscribe` throws while `fails` returns true and attaches otherwise.
function failingSubscribeFactory(fails: () => boolean) {
  const reported = Promise.withResolvers<DecisionCacheErrorReport>()
  const listeners: Array<(change: { keys?: readonly string[] }) => void> = []
  const decide = vi.fn(() => decision.boolean(true))
  const decideMany = vi.fn((keys: readonly string[]) =>
    Object.fromEntries(keys.map((key) => [key, decision.boolean(true)]))
  )
  const factory = createFlags({
    decide,
    decideMany,
    identify: () => ({ distinctId: "core" }),
    onCacheError: (report) => {
      reported.resolve(report)
    },
    subscribe: (notify) => {
      if (fails()) {
        throw new Error("subscribe failed")
      }
      listeners.push(notify)
      return () => null
    },
  })
  const emit = (keys: readonly string[]) => {
    for (const notify of listeners) notify({ keys })
  }
  return { decide, decideMany, emit, factory, reported }
}

async function renderAsync(node: ReactNode): Promise<void> {
  await act(() => {
    render(node)
    return Promise.resolve()
  })
}

describe("React integration", () => {
  it("uses evaluators directly and shares value and details evaluations", async () => {
    const { decide, factory } = makeFactory()
    const flag = factory({ defaultValue: false, key: "beta" })
    function Value() {
      return <span>{String(useFlag(flag))}</span>
    }
    function Details() {
      return <span>{useFlag(flag, { details: true }).source}</span>
    }
    await renderAsync(
      <FlagProvider>
        <Suspense fallback="loading">
          <Value />
          <Details />
        </Suspense>
      </FlagProvider>
    )
    expect(await screen.findByText("true")).toBeTruthy()
    expect(await screen.findByText("provider")).toBeTruthy()
    expect(decide).toHaveBeenCalledTimes(1)
  })

  it("uses provider identity and lets hook identity override it", async () => {
    const seen: unknown[] = []
    const factory = createFlags({
      decide: (_key, identity) => {
        seen.push(identity.distinctId)
        return decision.boolean(true)
      },
      identify: () => ({ distinctId: "core" }),
    })
    const flag = factory({ defaultValue: false, key: "beta" })
    function ProviderConsumer() {
      return <span>{String(useFlag(flag))}</span>
    }
    function HookConsumer() {
      return <span>{String(useFlag(flag, { identity: { distinctId: "hook" } }))}</span>
    }
    await renderAsync(
      <FlagProvider identity={{ distinctId: "provider" }}>
        <Suspense fallback="loading">
          <ProviderConsumer />
          <HookConsumer />
        </Suspense>
      </FlagProvider>
    )
    await screen.findAllByText("true")
    expect(seen.toSorted((left, right) => String(left).localeCompare(String(right)))).toEqual([
      "hook",
      "provider",
    ])
  })

  it("gives createFlagHooks hooks the identity of their own provider only", async () => {
    const seen: unknown[] = []
    const factory = createFlags({
      decide: (key, identity) => {
        seen.push(`${key}:${identity.distinctId}`)
        return decision.boolean(true)
      },
      identify: () => ({ distinctId: "core" }),
    })
    const bound = createFlagHooks(factory)
    const flag = factory({ defaultValue: false, key: "single" })
    const other = factory({ defaultValue: false, key: "batch" })
    const plain = factory({ defaultValue: false, key: "plain" })
    function BoundConsumer() {
      const [batchValue] = bound.useFlagBatch([other])
      return <span>{`${String(bound.useFlag(flag))}-${String(batchValue)}`}</span>
    }
    function PlainConsumer() {
      return <span>{String(useFlag(plain))}</span>
    }
    await renderAsync(
      <bound.FlagProvider identity={{ distinctId: "bound" }}>
        <Suspense fallback="loading">
          <BoundConsumer />
          <PlainConsumer />
        </Suspense>
      </bound.FlagProvider>
    )
    await screen.findByText("true-true")
    await screen.findByText("true")
    expect(seen.toSorted((left, right) => String(left).localeCompare(String(right)))).toEqual([
      "batch:bound",
      "plain:bound",
      "single:bound",
    ])
  })

  it("does not give createFlagHooks hooks the identity of a plain FlagProvider", async () => {
    const seen: unknown[] = []
    const factory = createFlags({
      decide: (_key, identity) => {
        seen.push(identity.distinctId)
        return decision.boolean(true)
      },
      identify: () => ({ distinctId: "core" }),
    })
    const bound = createFlagHooks(factory)
    const flag = factory({ defaultValue: false, key: "beta" })
    function BoundConsumer() {
      return <span>{String(bound.useFlag(flag))}</span>
    }
    await renderAsync(
      <FlagProvider identity={{ distinctId: "untyped" }}>
        <Suspense fallback="loading">
          <BoundConsumer />
        </Suspense>
      </FlagProvider>
    )
    await screen.findByText("true")
    expect(seen).toEqual(["core"])
  })

  it("supports custom functions and live invalidation", async () => {
    const call = vi.fn(() => Promise.resolve(7))
    const cache = createFlagCache()
    function Consumer() {
      return <span>{useFlag(call, { key: "answer" })}</span>
    }
    await renderAsync(
      <FlagProvider cache={cache}>
        <Suspense fallback="loading">
          <Consumer />
        </Suspense>
      </FlagProvider>
    )
    expect(await screen.findByText("7")).toBeTruthy()
    await act(() => {
      cache.invalidateKey("answer")
      return Promise.resolve()
    })
    expect(await screen.findByText("7")).toBeTruthy()
    expect(call).toHaveBeenCalledTimes(2)
  })

  it("batches flags in one provider call and preserves tuple order", async () => {
    const { decideMany, factory } = makeFactory()
    const beta = factory({ defaultValue: false, key: "beta" })
    const theme = factory({ defaultValue: "light", key: "theme", variants: ["light", "dark"] })
    function Consumer() {
      const [betaValue, themeValue] = useFlagBatch([beta, theme])
      return <span>{`${betaValue}:${themeValue}`}</span>
    }
    await renderAsync(
      <Suspense fallback="loading">
        <Consumer />
      </Suspense>
    )
    expect(await screen.findByText("true:dark")).toBeTruthy()
    expect(decideMany).toHaveBeenCalledTimes(1)
  })

  it("returns an empty tuple without suspension", () => {
    render(<EmptyBatchConsumer />)
    expect(screen.getByText("0")).toBeTruthy()
  })

  it("rejects batches from different factories", () => {
    const first = makeFactory().factory({ defaultValue: false, key: "first" })
    const second = makeFactory().factory({ defaultValue: false, key: "second" })
    function Consumer() {
      useFlagBatch([first, second])
      return null
    }
    expect(() => render(<Consumer />)).toThrow("Batch flags must be created by this flag factory")
  })

  it("prefetches one flag and batches without a second call", async () => {
    const { decide, decideMany, factory } = makeFactory()
    const beta = factory({ defaultValue: false, key: "beta" })
    const theme = factory({ defaultValue: "light", key: "theme", variants: ["light", "dark"] })
    const cache = createFlagCache()
    await cache.prefetch(beta)
    await cache.prefetchBatch([beta, theme])
    expect(decide).toHaveBeenCalledTimes(1)
    expect(decideMany).toHaveBeenCalledTimes(1)
  })

  it("keeps batches of different evaluators with one flag key apart", async () => {
    const decideMany = vi.fn((keys: readonly string[]) =>
      Object.fromEntries(keys.map((key) => [key, decision.boolean(true)]))
    )
    const factory = createFlags({
      decide: () => decision.boolean(true),
      decideMany,
      identify: () => ({ distinctId: "core" }),
    })
    const booleanFlag = factory({ defaultValue: false, key: "shared" })
    const variantFlag = factory({
      defaultValue: "light",
      key: "shared",
      variants: ["light", "dark"],
    })
    const cache = createFlagCache()
    await cache.prefetchBatch([booleanFlag])
    await cache.prefetchBatch([booleanFlag])
    expect(decideMany).toHaveBeenCalledTimes(1)
    function Consumer() {
      const [value] = useFlagBatch([variantFlag])
      return <span>{String(value)}</span>
    }
    await renderAsync(
      <FlagProvider cache={cache}>
        <Suspense fallback="loading">
          <Consumer />
        </Suspense>
      </FlagProvider>
    )
    expect(await screen.findByText("light")).toBeTruthy()
    expect(decideMany).toHaveBeenCalledTimes(2)

    cache.invalidateBatch([variantFlag])
    await cache.prefetchBatch([booleanFlag])
    expect(decideMany).toHaveBeenCalledTimes(2)
  })

  it("returns the active cache and isolates bare providers", () => {
    const caches: unknown[] = []
    function Capture() {
      caches.push(useFlagCache())
      return null
    }
    render(
      <>
        <FlagProvider>
          <Capture />
        </FlagProvider>
        <FlagProvider>
          <Capture />
        </FlagProvider>
      </>
    )
    expect(caches[0]).not.toBe(caches[1])
  })

  it("renders FeatureFlag from an evaluator", async () => {
    const flag = makeFactory().factory({ defaultValue: false, key: "beta" })
    await renderAsync(
      <FeatureFlag flag={flag} loading="loading" fallback="off">
        on
      </FeatureFlag>
    )
    expect(await screen.findByText("on")).toBeTruthy()
  })

  it("renders variant matches", async () => {
    const flag = makeFactory().factory({
      defaultValue: "light",
      key: "theme",
      variants: ["light", "dark"],
    })
    await renderAsync(
      <FeatureFlag flag={flag} loading="loading" match="dark">
        dark UI
      </FeatureFlag>
    )
    expect(await screen.findByText("dark UI")).toBeTruthy()
  })

  it("invalidates through the hook cache using the provider identity", async () => {
    const { decide, factory } = makeFactory()
    const flag = factory({ defaultValue: false, key: "beta" })
    function Consumer() {
      const cache = useFlagCache()
      const value = useFlag(flag)
      return (
        <button
          type="button"
          onClick={() => {
            cache.invalidate(flag)
          }}
        >
          {String(value)}
        </button>
      )
    }
    await renderAsync(
      <FlagProvider identity={{ distinctId: "provider" }}>
        <Suspense fallback="loading">
          <Consumer />
        </Suspense>
      </FlagProvider>
    )
    expect(decide).toHaveBeenCalledTimes(1)
    await act(() => {
      screen.getByRole("button").click()
      return Promise.resolve()
    })
    expect(await screen.findByText("true")).toBeTruthy()
    expect(decide).toHaveBeenCalledTimes(2)
  })

  it("applies the provider identity to hook cache prefetching", async () => {
    const seen: string[] = []
    const decideMany = vi.fn((keys: readonly string[], identity: { distinctId: string }) => {
      seen.push(identity.distinctId)
      return Object.fromEntries(keys.map((key) => [key, decision.boolean(true)]))
    })
    const factory = createFlags({
      decide: (_key, identity) => {
        seen.push(identity.distinctId)
        return decision.boolean(true)
      },
      decideMany,
      identify: () => ({ distinctId: "core" }),
    })
    const beta = factory({ defaultValue: false, key: "beta" })
    let prefetching: Promise<void> | undefined
    function Runner() {
      const cache = useFlagCache()
      return (
        <button
          type="button"
          onClick={() => {
            prefetching = (async () => {
              await cache.prefetch(beta)
              await cache.prefetchBatch([beta])
              cache.invalidateBatch([beta])
              await cache.prefetchBatch([beta])
            })()
          }}
        >
          run
        </button>
      )
    }
    render(
      <FlagProvider identity={{ distinctId: "provider" }}>
        <Runner />
      </FlagProvider>
    )
    await act(async () => {
      screen.getByRole("button").click()
      await prefetching
    })
    expect(seen).toEqual(["provider", "provider", "provider"])
    expect(decideMany).toHaveBeenCalledTimes(2)
  })

  it("invalidates a batch and clears the whole cache", async () => {
    const { decideMany, factory } = makeFactory()
    const beta = factory({ defaultValue: false, key: "beta" })
    const theme = factory({ defaultValue: "light", key: "theme", variants: ["light", "dark"] })
    const cache = createFlagCache()
    function Consumer() {
      const [betaValue, themeValue] = useFlagBatch([beta, theme])
      return <span>{`${betaValue}:${themeValue}`}</span>
    }
    await renderAsync(
      <FlagProvider cache={cache}>
        <Suspense fallback="loading">
          <Consumer />
        </Suspense>
      </FlagProvider>
    )
    expect(await screen.findByText("true:dark")).toBeTruthy()
    expect(decideMany).toHaveBeenCalledTimes(1)
    await act(() => {
      cache.invalidateBatch([beta, theme])
      return Promise.resolve()
    })
    expect(await screen.findByText("true:dark")).toBeTruthy()
    expect(decideMany).toHaveBeenCalledTimes(2)
    await act(() => {
      cache.clear()
      return Promise.resolve()
    })
    expect(await screen.findByText("true:dark")).toBeTruthy()
    expect(decideMany).toHaveBeenCalledTimes(3)
  })

  it("re-evaluates only for change notifications naming a subscribed key", async () => {
    let emit: ((keys: readonly string[]) => void) | undefined
    const decide = vi.fn(() => decision.boolean(true))
    const factory = createFlags({
      decide,
      identify: () => ({ distinctId: "core" }),
      subscribe: (listener) => {
        emit = (keys) => {
          listener({ keys })
        }
        return () => null
      },
    })
    const flag = factory({ defaultValue: false, key: "beta" })
    function Consumer() {
      return <span>{String(useFlag(flag))}</span>
    }
    await renderAsync(
      <FlagProvider>
        <Suspense fallback="loading">
          <Consumer />
        </Suspense>
      </FlagProvider>
    )
    expect(decide).toHaveBeenCalledTimes(1)
    await act(() => {
      emit?.(["other"])
      return Promise.resolve()
    })
    expect(decide).toHaveBeenCalledTimes(1)
    await act(() => {
      emit?.(["beta"])
      return Promise.resolve()
    })
    expect(await screen.findByText("true")).toBeTruthy()
    expect(decide).toHaveBeenCalledTimes(2)
  })

  it.each(["prefetch", "unmount"] as const)(
    "re-evaluates a flag that changed after %s while no component read it",
    async (retainedBy) => {
      const { decide, factory, provider } = changingFactory()
      const flag = factory({ defaultValue: false, key: "beta" })
      const cache = createFlagCache()
      function Consumer() {
        return <span>{String(useFlag(flag))}</span>
      }
      const tree = (
        <FlagProvider cache={cache}>
          <Suspense fallback="loading">
            <Consumer />
          </Suspense>
        </FlagProvider>
      )
      if (retainedBy === "prefetch") {
        await cache.prefetch(flag)
      } else {
        await renderAsync(tree)
        expect(await screen.findByText("true")).toBeTruthy()
        cleanup()
      }

      provider.value = false
      await act(() => {
        provider.emit(["beta"])
        return Promise.resolve()
      })
      await renderAsync(tree)

      expect(await screen.findByText("false")).toBeTruthy()
      expect(decide).toHaveBeenCalledTimes(2)
    }
  )

  it.each(["prefetch", "unmount"] as const)(
    "re-evaluates a batch that changed after %s while no component read it",
    async (retainedBy) => {
      const { decideMany, factory, provider } = changingFactory()
      const flag = factory({ defaultValue: false, key: "beta" })
      const cache = createFlagCache()
      function Consumer() {
        const [value] = useFlagBatch([flag])
        return <span>{String(value)}</span>
      }
      const tree = (
        <FlagProvider cache={cache}>
          <Suspense fallback="loading">
            <Consumer />
          </Suspense>
        </FlagProvider>
      )
      if (retainedBy === "prefetch") {
        await cache.prefetchBatch([flag])
      } else {
        await renderAsync(tree)
        expect(await screen.findByText("true")).toBeTruthy()
        cleanup()
      }

      provider.value = false
      await act(() => {
        provider.emit(["beta"])
        return Promise.resolve()
      })
      await renderAsync(tree)

      expect(await screen.findByText("false")).toBeTruthy()
      expect(decideMany).toHaveBeenCalledTimes(2)
    }
  )

  it.each(["prefetch", "prefetchBatch"] as const)(
    "evaluates with %s and reports the error when subscribe throws",
    async (method) => {
      const { decide, decideMany, factory, reported } = failingSubscribeFactory(() => true)
      const flag = factory({ defaultValue: false, key: "beta" })
      const cache = createFlagCache()

      await (method === "prefetch" ? cache.prefetch(flag) : cache.prefetchBatch([flag]))

      expect(decide.mock.calls.length + decideMany.mock.calls.length).toBe(1)
      expect(await reported.promise).toMatchObject({
        error: new Error("subscribe failed"),
        flagKey: "beta",
        operation: "subscribe",
      })
    }
  )

  it("renders a flag and reports the error when subscribe throws", async () => {
    const { decide, factory, reported } = failingSubscribeFactory(() => true)
    const flag = factory({ defaultValue: false, key: "beta" })
    function Consumer() {
      return <span>{String(useFlag(flag))}</span>
    }
    await renderAsync(
      <FlagProvider>
        <Suspense fallback="loading">
          <Consumer />
        </Suspense>
      </FlagProvider>
    )

    expect(await screen.findByText("true")).toBeTruthy()
    expect(decide).toHaveBeenCalledTimes(1)
    expect(await reported.promise).toMatchObject({ flagKey: "beta", operation: "subscribe" })
  })

  it("attaches the change clock on a later evaluation after subscribe throws", async () => {
    let attempts = 0
    const { decide, emit, factory } = failingSubscribeFactory(() => {
      attempts += 1
      return attempts === 1
    })
    const flag = factory({ defaultValue: false, key: "beta" })
    const cache = createFlagCache()
    const first = { distinctId: "first" }

    await cache.prefetch(flag, { identity: first })
    await cache.prefetch(flag, { identity: { distinctId: "second" } })
    await act(() => {
      emit(["beta"])
      return Promise.resolve()
    })
    await cache.prefetch(flag, { identity: first })

    expect(decide).toHaveBeenCalledTimes(3)
  })

  it("keeps a retained entry when a change names another flag", async () => {
    const { decide, factory, provider } = changingFactory()
    const flag = factory({ defaultValue: false, key: "beta" })
    const cache = createFlagCache()
    await cache.prefetch(flag)

    await act(() => {
      provider.emit(["other"])
      return Promise.resolve()
    })
    await cache.prefetch(flag)
    expect(decide).toHaveBeenCalledTimes(1)

    await act(() => {
      provider.emit()
      return Promise.resolve()
    })
    await cache.prefetch(flag)
    expect(decide).toHaveBeenCalledTimes(2)
  })

  it("releases the version store when the last subscriber unmounts", async () => {
    const flag = makeFactory().factory({ defaultValue: false, key: "beta" })
    const cache = createFlagCache()
    function Consumer() {
      return <span>{String(useFlag(flag))}</span>
    }
    await renderAsync(
      <FlagProvider cache={cache}>
        <Suspense fallback="loading">
          <Consumer />
        </Suspense>
      </FlagProvider>
    )
    const stores = [
      ...(cache as unknown as { allBuckets: Set<{ stores: Map<string, unknown> }> }).allBuckets,
    ]
    expect(stores.some((bucket) => bucket.stores.size > 0)).toBe(true)
    cleanup()
    expect(stores.every((bucket) => bucket.stores.size === 0)).toBe(true)
  })

  it("evicts a rejected evaluation so a later read retries", async () => {
    const errors: unknown[] = []
    // oxlint-disable-next-line no-console -- Captures the development warning under test.
    const original = console.error
    // oxlint-disable-next-line no-console -- The warning under test is emitted through console.error.
    console.error = (...args: unknown[]) => errors.push(args[0])
    const call = vi.fn(() => Promise.reject(new Error("boom")))
    const cache = createFlagCache()
    function Consumer() {
      return <span>{useFlag(call, { key: "retry" })}</span>
    }
    try {
      await renderAsync(
        <FlagProvider cache={cache}>
          <ErrorBoundary>
            <Suspense fallback="loading">
              <Consumer />
            </Suspense>
          </ErrorBoundary>
        </FlagProvider>
      )
      expect(await screen.findByText("failed")).toBeTruthy()
    } finally {
      // oxlint-disable-next-line no-console -- Restores the stub installed above.
      console.error = original
    }
    // The rejected entry is evicted on the next task, not synchronously.
    await sleep(1)
    cleanup()
    const call2 = vi.fn(() => Promise.resolve(9))
    function Retry() {
      return <span>{useFlag(call2, { key: "retry" })}</span>
    }
    await renderAsync(
      <FlagProvider cache={cache}>
        <Suspense fallback="loading">
          <Retry />
        </Suspense>
      </FlagProvider>
    )
    expect(await screen.findByText("9")).toBeTruthy()
  })

  it("rejects invalid cache options", () => {
    expect(() => createFlagCache({ maxEntries: 0 })).toThrow(RangeError)
    expect(() => createFlagCache({ maxEntries: 1.5 })).toThrow(RangeError)
    expect(() => createFlagCache({ pendingTtlMs: 0 })).toThrow(RangeError)
    expect(() => createFlagCache({ ttlMs: Number.POSITIVE_INFINITY })).toThrow(RangeError)
  })

  it("requires a key for the function form", () => {
    expect(() => render(<KeylessConsumer />)).toThrow("useFlag(fn, options) requires a key option")
  })

  it("falls back when a variant flag has no match prop", async () => {
    const errors: unknown[] = []
    // oxlint-disable-next-line no-console -- Captures the development warning under test.
    const original = console.error
    // oxlint-disable-next-line no-console -- The warning under test is emitted through console.error.
    console.error = (...args: unknown[]) => errors.push(args[0])
    const flag = makeFactory().factory({
      defaultValue: "light",
      key: "theme",
      variants: ["light", "dark"],
    })
    try {
      await renderAsync(
        // @ts-expect-error -- omitting match is the misuse under test.
        <FeatureFlag flag={flag} loading="loading" fallback="off">
          dark UI
        </FeatureFlag>
      )
      expect(await screen.findByText("off")).toBeTruthy()
    } finally {
      // oxlint-disable-next-line no-console -- Restores the stub installed above.
      console.error = original
    }
    expect(errors.some((error) => String(error).includes("requires a match prop"))).toBe(true)
  })

  it("cleans up between tests", () => {
    cleanup()
    expect(document.body.textContent).toBe("")
  })
})

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }
  override render(): ReactNode {
    return this.state.failed ? "failed" : this.props.children
  }
}

function KeylessConsumer() {
  // @ts-expect-error -- the key option is required for the function form.
  useFlag(() => Promise.resolve(1))
  return null
}

function EmptyBatchConsumer() {
  return <span>{useFlagBatch([]).length}</span>
}

function settledFactory() {
  const decide = vi.fn(() => decision.boolean(true))
  const factory = createFlags({ decide, identify: () => ({ distinctId: "core" }) })
  return { decide, flag: factory({ defaultValue: false, key: "beta" }) }
}

describe("flag cache bounds", () => {
  it("evicts the least recently used settled evaluation", async () => {
    const { decide, flag } = settledFactory()
    const cache = createFlagCache({ maxEntries: 2 })

    await cache.prefetch(flag, { identity: { distinctId: "first" } })
    await cache.prefetch(flag, { identity: { distinctId: "second" } })
    await sleep(1)
    await cache.prefetch(flag, { identity: { distinctId: "first" } })
    await cache.prefetch(flag, { identity: { distinctId: "third" } })
    await sleep(1)
    expect(decide).toHaveBeenCalledTimes(3)

    await cache.prefetch(flag, { identity: { distinctId: "second" } })
    expect(decide).toHaveBeenCalledTimes(4)
    await cache.prefetch(flag, { identity: { distinctId: "third" } })
    expect(decide).toHaveBeenCalledTimes(4)
  })

  it("expires settled evaluations after ttlMs", async () => {
    let now = 0
    const dateNow = vi.spyOn(Date, "now").mockImplementation(() => now)
    const { decide, flag } = settledFactory()
    const cache = createFlagCache({ ttlMs: 100 })

    await cache.prefetch(flag)
    now = 50
    await cache.prefetch(flag)
    expect(decide).toHaveBeenCalledTimes(1)

    now = 201
    await cache.prefetch(flag)
    expect(decide).toHaveBeenCalledTimes(2)
    dateNow.mockRestore()
  })
})
