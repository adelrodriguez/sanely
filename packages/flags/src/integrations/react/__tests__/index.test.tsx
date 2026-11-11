// @vitest-environment happy-dom

import { setTimeout as sleep } from "node:timers/promises"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { Component, type ReactNode, StrictMode, Suspense, useLayoutEffect } from "react"
import { hydrateRoot } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  anonymous,
  type CallerFlags,
  createFlags,
  decision,
  defineProvider,
  type Flag,
  flag,
  type FlagReader,
  FlagDefinitionError,
  type FlagSnapshot,
  type Identity,
} from "#index.ts"
import {
  FeatureFlag,
  type FlagCacheControls,
  type FlagCacheOptions,
  FlagsProvider,
  FlagsProviderMissingError,
  useFlag,
  useFlagCache,
  useFlags,
} from "#integrations/react/index.tsx"
import { fakeProvider, memoryStore } from "#testing/index.ts"

const hydrated: Array<{ container: HTMLElement; unmount: () => void }> = []

afterEach(() => {
  cleanup()
  for (const { container, unmount } of hydrated.splice(0)) {
    act(() => {
      unmount()
    })
    container.remove()
  }
})

const beta = flag.boolean("beta", false)
const theme = flag.variant("theme", ["light", "dark"], "light")

/**
 * A provider whose boolean flags return `value` and whose variant flags return `dark`. `emit` sends
 * a change notification, and `seen` records the identity of each call.
 */
function makeProvider() {
  const state = { value: true }
  const seen: unknown[] = []
  let notify: ((keys?: readonly string[]) => void) | undefined
  const answer = (item: Flag) =>
    item.kind === "variant" ? decision.variant("dark") : decision.boolean(state.value)
  const decideOne = vi.fn((item: Flag, identity: Identity) => {
    seen.push(identity.distinctId)
    return answer(item)
  })
  const decide = vi.fn((flags: readonly Flag[], identity: Identity) => {
    seen.push(identity.distinctId)
    return Object.fromEntries(flags.map((item) => [item.key, answer(item)]))
  })
  const subscribe = (listener: (keys?: readonly string[]) => void) => {
    notify = listener
    return () => {
      notify = undefined
    }
  }
  return {
    bulk: defineProvider({ decide, name: "bulk", subscribe }),
    decide,
    decideOne,
    emit: (keys?: readonly string[]) => notify?.(keys),
    seen,
    single: defineProvider({ decideOne, name: "single", subscribe }),
    state,
  }
}

// Coalescing is off, so each cache miss makes its own provider call and the call counts show the
// React cache's behavior alone.
function makeFlags(kind: "bulk" | "single" = "single") {
  const provider = makeProvider()
  const flags = createFlags({
    cache: { coalesce: false },
    identify: () => ({ distinctId: "core" }),
    provider: provider[kind],
  })
  return { ...provider, flags }
}

async function renderAsync(node: ReactNode) {
  let result: ReturnType<typeof render> | undefined
  await act(() => {
    result = render(node)
    return Promise.resolve()
  })
  if (!result) throw new Error("render did not run")
  return result
}

function Value({ item }: { item: Flag }) {
  return <span>{String(useFlag(item))}</span>
}

function Capture({ onCapture }: { onCapture: (controls: FlagCacheControls) => void }) {
  onCapture(useFlagCache())
  return null
}

/**
 * Captures the cache controls of the nearest provider through the returned `capture` element.
 */
function captureCache() {
  let captured: FlagCacheControls | undefined
  const capture = (
    <Capture
      onCapture={(controls) => {
        captured = controls
      }}
    />
  )
  const controls = () => {
    if (!captured) throw new Error("the cache was not captured")
    return captured
  }
  return { capture, controls }
}

function First() {
  return <span>{`first:${useFlag(beta)}`}</span>
}

function Second() {
  return <span>{`second:${useFlag(beta)}`}</span>
}

function CacheConsumer() {
  useFlagCache()
  return null
}

function BetaAndTheme() {
  const [betaValue, themeValue] = useFlags([beta, theme])
  return <span>{`${betaValue}:${themeValue}`}</span>
}

function EmptyTuple() {
  return <span>{useFlags([]).length}</span>
}

type TestFlags = ReturnType<typeof makeFlags>["flags"]

function readerTree(flags: TestFlags) {
  return (
    <FlagsProvider flags={flags}>
      <Suspense fallback="loading">
        <Value item={beta} />
      </Suspense>
    </FlagsProvider>
  )
}

function identityTree(flags: TestFlags, distinctId: string, cache: object, capture: ReactNode) {
  return (
    <FlagsProvider flags={flags} identity={{ distinctId }} cache={cache}>
      {capture}
    </FlagsProvider>
  )
}

function Page() {
  const [betaValue, themeValue] = useFlags([beta, theme])
  return (
    <main>
      <span>{`${betaValue}:${themeValue}`}</span>
      <FeatureFlag flag={beta} fallback="off">
        on
      </FeatureFlag>
    </main>
  )
}

function App({
  flags,
  identity,
  snapshot,
}: {
  flags: TestFlags
  identity?: Identity
  snapshot?: FlagSnapshot
}) {
  const page = (
    <Suspense fallback="loading">
      <Page />
    </Suspense>
  )
  return identity ? (
    <FlagsProvider flags={flags} identity={identity} snapshot={snapshot}>
      {page}
    </FlagsProvider>
  ) : (
    <FlagsProvider flags={flags} snapshot={snapshot}>
      {page}
    </FlagsProvider>
  )
}

async function serverRender(identity: Identity) {
  const server = makeFlags("bulk")
  const snapshot = await server.flags.for(identity).snapshot([beta, theme])
  const html = renderToString(<App flags={server.flags} identity={identity} snapshot={snapshot} />)
  // The snapshot crosses the server-to-client boundary as JSON.
  const json = JSON.stringify(snapshot)
  return { html, snapshot: JSON.parse(json) as FlagSnapshot }
}

function mount(html: string) {
  const container = document.createElement("div")
  container.innerHTML = html
  document.body.append(container)
  return container
}

function hydrate(
  container: HTMLElement,
  node: ReactNode,
  options?: Parameters<typeof hydrateRoot>[2]
) {
  const root = hydrateRoot(container, node, options)
  hydrated.push({
    container,
    unmount: () => {
      root.unmount()
    },
  })
}

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }
  override render(): ReactNode {
    return this.state.failed ? "failed" : this.props.children
  }
}

function silenceConsoleError() {
  const errors: unknown[] = []
  const spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args[0])
  })
  return {
    errors,
    restore: () => {
      spy.mockRestore()
    },
  }
}

describe("React integration", () => {
  it("throws FlagsProviderMissingError without a provider", () => {
    const silenced = silenceConsoleError()
    try {
      expect(() => render(<Value item={beta} />)).toThrow(FlagsProviderMissingError)
      expect(() => render(<CacheConsumer />)).toThrow(FlagsProviderMissingError)
    } finally {
      silenced.restore()
    }
  })

  it("reads a flag once for every component that reads it", async () => {
    const { decideOne, flags } = makeFlags()
    await renderAsync(
      <FlagsProvider flags={flags}>
        <Suspense fallback="loading">
          <Value item={beta} />
          <Value item={beta} />
        </Suspense>
      </FlagsProvider>
    )
    expect(await screen.findAllByText("true")).toHaveLength(2)
    expect(decideOne).toHaveBeenCalledTimes(1)
  })

  it("reads from a new reader when the flags prop changes", async () => {
    const first = makeFlags()
    const second = makeFlags()
    second.state.value = false
    const { rerender } = await renderAsync(readerTree(first.flags))
    expect(await screen.findByText("true")).toBeTruthy()

    await act(() => {
      rerender(readerTree(second.flags))
      return Promise.resolve()
    })
    expect(await screen.findByText("false")).toBeTruthy()

    // The provider of the replaced reader no longer re-renders the component.
    second.decideOne.mockClear()
    await act(() => {
      first.emit(["beta"])
      return Promise.resolve()
    })
    expect(second.decideOne).not.toHaveBeenCalled()
  })

  it("evaluates for the provider identity instead of identify", async () => {
    const { flags, seen } = makeFlags()
    await renderAsync(
      <FlagsProvider flags={flags} identity={{ distinctId: "provider" }}>
        <Suspense fallback="loading">
          <Value item={beta} />
        </Suspense>
      </FlagsProvider>
    )
    await screen.findByText("true")
    expect(seen).toEqual(["provider"])
  })

  it("evaluates a reader without identify for the provider identity", async () => {
    const provider = makeProvider()
    const serverFlags = createFlags({ provider: provider.single })
    await renderAsync(
      <FlagsProvider flags={serverFlags} identity={{ distinctId: "caller" }}>
        <Suspense fallback="loading">
          <Value item={beta} />
        </Suspense>
      </FlagsProvider>
    )
    await screen.findByText("true")
    expect(provider.seen).toEqual(["caller"])
  })

  it("keeps the cached value when the identity object changes but its content does not", async () => {
    const { decideOne, flags } = makeFlags()
    const tree = (distinctId: string) => (
      <FlagsProvider flags={flags} identity={{ distinctId }}>
        <Suspense fallback="loading">
          <Value item={beta} />
        </Suspense>
      </FlagsProvider>
    )
    const { rerender } = await renderAsync(tree("first"))
    await screen.findByText("true")
    await act(() => {
      rerender(tree("first"))
      return Promise.resolve()
    })
    expect(decideOne).toHaveBeenCalledTimes(1)
    await act(() => {
      rerender(tree("second"))
      return Promise.resolve()
    })
    await screen.findByText("true")
    expect(decideOne).toHaveBeenCalledTimes(2)
  })

  it("batches flags in one provider call and preserves tuple order", async () => {
    const { decide, flags } = makeFlags("bulk")
    await renderAsync(
      <FlagsProvider flags={flags}>
        <Suspense fallback="loading">
          <BetaAndTheme />
        </Suspense>
      </FlagsProvider>
    )
    expect(await screen.findByText("true:dark")).toBeTruthy()
    expect(decide).toHaveBeenCalledTimes(1)
  })

  it("returns an empty tuple without suspension", () => {
    const { flags } = makeFlags()
    render(
      <FlagsProvider flags={flags}>
        <EmptyTuple />
      </FlagsProvider>
    )
    expect(screen.getByText("0")).toBeTruthy()
  })

  it("prefetches flags so a later read with the same flags does not call the provider", async () => {
    const { decideOne, flags } = makeFlags()
    const { capture, controls } = captureCache()
    render(<FlagsProvider flags={flags}>{capture}</FlagsProvider>)
    await controls().prefetch([beta])
    await controls().prefetch([beta])
    await controls().prefetch([])
    expect(decideOne).toHaveBeenCalledTimes(1)
  })

  it("keeps batches of different flags with one key apart", async () => {
    const { decide, flags } = makeFlags("bulk")
    const sharedBoolean = flag.boolean("shared", false)
    const sharedVariant = flag.variant("shared", ["light", "dark"], "light")
    const { capture, controls } = captureCache()
    function Consumer() {
      const [value] = useFlags([sharedVariant, beta])
      return <span>{String(value)}</span>
    }
    await renderAsync(
      <FlagsProvider flags={flags}>
        {capture}
        <Suspense fallback="loading">
          <Consumer />
        </Suspense>
      </FlagsProvider>
    )
    expect(await screen.findByText("dark")).toBeTruthy()
    expect(decide).toHaveBeenCalledTimes(1)
    await controls().prefetch([sharedBoolean, beta])
    expect(decide).toHaveBeenCalledTimes(2)
    await controls().prefetch([sharedBoolean, beta])
    expect(decide).toHaveBeenCalledTimes(2)
  })

  it("gives each provider mount its own cache", async () => {
    const { decideOne, flags } = makeFlags()
    const tree = (
      <FlagsProvider flags={flags}>
        <Suspense fallback="loading">
          <Value item={beta} />
        </Suspense>
      </FlagsProvider>
    )
    await renderAsync(
      <>
        {tree}
        {tree}
      </>
    )
    expect(await screen.findAllByText("true")).toHaveLength(2)
    expect(decideOne).toHaveBeenCalledTimes(2)
  })

  it("invalidates flags through the hook cache and re-renders their readers", async () => {
    const { decide, flags } = makeFlags("bulk")
    const { capture, controls } = captureCache()
    await renderAsync(
      <FlagsProvider flags={flags} identity={{ distinctId: "provider" }}>
        {capture}
        <Suspense fallback="loading">
          <BetaAndTheme />
          <Value item={beta} />
        </Suspense>
      </FlagsProvider>
    )
    expect(await screen.findByText("true:dark")).toBeTruthy()
    expect(decide).toHaveBeenCalledTimes(2)

    await act(() => {
      controls().invalidate([theme])
      return Promise.resolve()
    })
    expect(await screen.findByText("true:dark")).toBeTruthy()
    expect(decide).toHaveBeenCalledTimes(3)

    await act(() => {
      controls().clear()
      return Promise.resolve()
    })
    expect(await screen.findByText("true:dark")).toBeTruthy()
    expect(decide).toHaveBeenCalledTimes(5)
  })

  it("re-renders a reader whose flag a layout effect invalidates before it subscribes", async () => {
    const { decideOne, flags, state } = makeFlags()
    const snapshot: FlagSnapshot = {
      distinctId: "core",
      flags: { beta: { kind: "boolean", source: "provider", value: true } },
    }
    function InvalidateOnLayout() {
      const cache = useFlagCache()
      useLayoutEffect(() => {
        state.value = false
        cache.invalidate([beta])
      }, [cache])
      return null
    }
    await renderAsync(
      <FlagsProvider flags={flags} snapshot={snapshot}>
        <Suspense fallback="loading">
          <Value item={beta} />
        </Suspense>
        <InvalidateOnLayout />
      </FlagsProvider>
    )
    expect(await screen.findByText("false")).toBeTruthy()
    expect(decideOne).toHaveBeenCalledTimes(1)
  it("asks the provider again on invalidate when the reader has a store", async () => {
    const provider = makeProvider()
    const flags = createFlags({
      cache: { store: memoryStore() },
      identify: () => ({ distinctId: "core" }),
      provider: provider.single,
    })
    const { capture, controls } = captureCache()
    await renderAsync(
      <FlagsProvider flags={flags}>
        {capture}
        <Suspense fallback="loading">
          <Value item={beta} />
        </Suspense>
      </FlagsProvider>
    )
    expect(await screen.findByText("true")).toBeTruthy()

    provider.state.value = false
    await act(() => {
      controls().invalidate([beta])
      return Promise.resolve()
    })
    expect(await screen.findByText("false")).toBeTruthy()
  })

  it("re-renders readers on invalidate after React resubscribes them", async () => {
    const { decideOne, flags, state } = makeFlags()
    const { capture, controls } = captureCache()
    // Strict mode subscribes, unsubscribes, and subscribes again, as a remount of the same reader
    // does in production.
    await renderAsync(
      <StrictMode>
        <FlagsProvider flags={flags}>
          {capture}
          <Suspense fallback="loading">
            <Value item={beta} />
          </Suspense>
        </FlagsProvider>
      </StrictMode>
    )
    expect(await screen.findByText("true")).toBeTruthy()
    const calls = decideOne.mock.calls.length

    state.value = false
    await act(() => {
      controls().invalidate([beta])
      return Promise.resolve()
    })
    expect(await screen.findByText("false")).toBeTruthy()
    expect(decideOne).toHaveBeenCalledTimes(calls + 1)
  })

  it("re-renders a reader that replaces another reader of the same flags", async () => {
    const { decideOne, flags, state } = makeFlags()
    const { capture, controls } = captureCache()
    const tree = (child: ReactNode) => (
      <FlagsProvider flags={flags}>
        {capture}
        <Suspense fallback="loading">{child}</Suspense>
      </FlagsProvider>
    )
    const { rerender } = await renderAsync(tree(<First />))
    expect(await screen.findByText("first:true")).toBeTruthy()
    // React runs the first reader's cleanup before the second reader subscribes.
    await act(() => {
      rerender(tree(<Second />))
      return Promise.resolve()
    })
    expect(await screen.findByText("second:true")).toBeTruthy()
    const calls = decideOne.mock.calls.length

    state.value = false
    await act(() => {
      controls().invalidate([beta])
      return Promise.resolve()
    })
    expect(await screen.findByText("second:false")).toBeTruthy()
    expect(decideOne).toHaveBeenCalledTimes(calls + 1)
  })

  it("re-evaluates only for change notifications naming a read key", async () => {
    const { decideOne, emit, flags } = makeFlags()
    await renderAsync(
      <FlagsProvider flags={flags}>
        <Suspense fallback="loading">
          <Value item={beta} />
        </Suspense>
      </FlagsProvider>
    )
    await screen.findByText("true")
    expect(decideOne).toHaveBeenCalledTimes(1)
    await act(() => {
      emit(["other"])
      return Promise.resolve()
    })
    expect(decideOne).toHaveBeenCalledTimes(1)
    await act(() => {
      emit(["beta"])
      return Promise.resolve()
    })
    expect(await screen.findByText("true")).toBeTruthy()
    expect(decideOne).toHaveBeenCalledTimes(2)
    await act(() => {
      emit()
      return Promise.resolve()
    })
    expect(await screen.findByText("true")).toBeTruthy()
    expect(decideOne).toHaveBeenCalledTimes(3)
  })

  it.each(["prefetch", "unmount"] as const)(
    "re-evaluates a flag that changed after %s while no component read it",
    async (retainedBy) => {
      const { decideOne, emit, flags, state } = makeFlags()
      const { capture, controls } = captureCache()
      const tree = (show: boolean) => (
        <FlagsProvider flags={flags}>
          {capture}
          <Suspense fallback="loading">{show ? <Value item={beta} /> : null}</Suspense>
        </FlagsProvider>
      )
      const { rerender } = await renderAsync(tree(retainedBy === "unmount"))
      if (retainedBy === "prefetch") {
        await controls().prefetch([beta])
      } else {
        expect(await screen.findByText("true")).toBeTruthy()
        await act(() => {
          rerender(tree(false))
          return Promise.resolve()
        })
      }

      state.value = false
      await act(async () => {
        emit(["beta"])
        await sleep(0)
      })
      await act(() => {
        rerender(tree(true))
        return Promise.resolve()
      })

      expect(await screen.findByText("false")).toBeTruthy()
      expect(decideOne).toHaveBeenCalledTimes(2)
    }
  )

  it("keeps a retained entry when a change names another flag", async () => {
    const { decideOne, emit, flags } = makeFlags()
    const { capture, controls } = captureCache()
    render(<FlagsProvider flags={flags}>{capture}</FlagsProvider>)
    await controls().prefetch([beta])
    // Reader listeners run in a microtask after the notification.
    emit(["other"])
    await sleep(0)
    await controls().prefetch([beta])
    expect(decideOne).toHaveBeenCalledTimes(1)
    emit()
    await sleep(0)
    await controls().prefetch([beta])
    expect(decideOne).toHaveBeenCalledTimes(2)
  })

  it("renders a flag when the provider subscribe throws", async () => {
    const reports: unknown[] = []
    const decideOne = vi.fn(() => decision.boolean(true))
    const flags = createFlags({
      identify: () => ({ distinctId: "core" }),
      onError: (report) => {
        reports.push(report._tag)
      },
      provider: defineProvider({
        decideOne,
        name: "failing",
        subscribe: () => {
          throw new Error("subscribe failed")
        },
      }),
    })
    await renderAsync(
      <FlagsProvider flags={flags}>
        <Suspense fallback="loading">
          <Value item={beta} />
        </Suspense>
      </FlagsProvider>
    )
    expect(await screen.findByText("true")).toBeTruthy()
    expect(decideOne).toHaveBeenCalledTimes(1)
    await sleep(1)
    expect(reports).toContain("SubscribeFailed")
  })

  it("drops a snapshot value after a change once a failed subscribe recovers", async () => {
    let notify: ((keys?: readonly string[]) => void) | undefined
    let attempts = 0
    const flags = createFlags({
      identify: () => ({ distinctId: "user" }),
      onError: vi.fn(),
      provider: defineProvider({
        decideOne: () => decision.boolean(false),
        name: "recovering",
        subscribe: (listener) => {
          attempts += 1
          if (attempts === 1) throw new Error("subscribe failed")
          notify = listener
          return () => {
            notify = undefined
          }
        },
      }),
    })
    const snapshot: FlagSnapshot = {
      distinctId: "user",
      flags: { beta: { kind: "boolean", source: "provider", value: true } },
    }
    await renderAsync(
      <FlagsProvider flags={flags} snapshot={snapshot}>
        <Suspense fallback="loading">
          <Value item={beta} />
        </Suspense>
      </FlagsProvider>
    )
    expect(screen.getByText("true")).toBeTruthy()
    expect(notify).toBeDefined()

    await act(async () => {
      notify?.(["beta"])
      await sleep(1)
    })
    expect(await screen.findByText("false")).toBeTruthy()
  })

  it("re-reads after the last reader unmounts and mounts again", async () => {
    const { decideOne, emit, flags } = makeFlags()
    const tree = (
      <FlagsProvider flags={flags}>
        <Suspense fallback="loading">
          <Value item={beta} />
        </Suspense>
      </FlagsProvider>
    )
    await renderAsync(tree)
    await screen.findByText("true")
    cleanup()
    // A change with no mounted reader does not throw or re-render.
    emit(["beta"])
    await renderAsync(tree)
    expect(await screen.findByText("true")).toBeTruthy()
    expect(decideOne).toHaveBeenCalledTimes(2)
  })

  it("evicts a rejected evaluation so a later read retries", async () => {
    const silenced = silenceConsoleError()
    let fail = true
    // Reads never reject, so a hand-built reader stands in for one that fails.
    const details = vi.fn(() =>
      fail
        ? Promise.reject(new Error("boom"))
        : Promise.resolve({ flagKey: "beta", source: "provider" as const, value: true })
    )
    const reader = { ...makeFlags().flags, details } as FlagReader
    const flags: CallerFlags<Identity> = {
      for: () => reader,
      subscribe: () => () => null,
    }
    const { capture, controls } = captureCache()
    try {
      await renderAsync(
        <FlagsProvider flags={flags} identity={{ distinctId: "user" }}>
          {capture}
          <ErrorBoundary>
            <Suspense fallback="loading">
              <Value item={beta} />
            </Suspense>
          </ErrorBoundary>
        </FlagsProvider>
      )
      expect(await screen.findByText("failed")).toBeTruthy()
    } finally {
      silenced.restore()
    }
    // The rejected entry is evicted on the next task, not synchronously.
    await sleep(1)
    fail = false
    await controls().prefetch([beta])
    expect(details).toHaveBeenCalledTimes(2)
  })

  it("rejects invalid cache options", () => {
    const { flags } = makeFlags()
    const silenced = silenceConsoleError()
    try {
      const invalid: Array<FlagCacheOptions<"1s" | "0s">> = [
        { maxEntries: 0 },
        { maxEntries: 1.5 },
        { pendingTtl: 0 },
        { ttl: Number.POSITIVE_INFINITY },
        { ttl: "soon" as "1s" },
        { pendingTtl: "0s" },
      ]
      for (const cache of invalid) {
        expect(() =>
          render(
            <FlagsProvider flags={flags} cache={cache}>
              child
            </FlagsProvider>
          )
        ).toThrow(FlagDefinitionError)
      }
    } finally {
      silenced.restore()
    }
  })

  it("returns the defaults when a reader without identify has no identity", async () => {
    const provider = makeProvider()
    const serverFlags = createFlags({ provider: provider.single })
    await renderAsync(
      // @ts-expect-error A reader without `identify` needs an identity; the misuse is under test.
      <FlagsProvider flags={serverFlags}>
        <Suspense fallback="loading">
          <Value item={beta} />
        </Suspense>
      </FlagsProvider>
    )
    expect(await screen.findByText("false")).toBeTruthy()
    expect(provider.decideOne).not.toHaveBeenCalled()
  })
})

describe("FeatureFlag", () => {
  it("renders the children when a boolean flag is true", async () => {
    const { flags } = makeFlags()
    await renderAsync(
      <FlagsProvider flags={flags}>
        <FeatureFlag flag={beta} loading="loading" fallback="off">
          on
        </FeatureFlag>
      </FlagsProvider>
    )
    expect(await screen.findByText("on")).toBeTruthy()
  })

  it("renders the fallback when a boolean flag is false", async () => {
    const { flags, state } = makeFlags()
    state.value = false
    await renderAsync(
      <FlagsProvider flags={flags}>
        <FeatureFlag flag={beta} loading="loading" fallback="off">
          on
        </FeatureFlag>
      </FlagsProvider>
    )
    expect(await screen.findByText("off")).toBeTruthy()
  })

  it("renders variant matches and the fallback for other variants", async () => {
    const { flags } = makeFlags()
    await renderAsync(
      <FlagsProvider flags={flags}>
        <Suspense fallback="loading">
          <FeatureFlag flag={theme} match="dark">
            <span>dark UI</span>
          </FeatureFlag>
          <FeatureFlag flag={theme} match="light" fallback={<span>not light</span>}>
            <span>light UI</span>
          </FeatureFlag>
        </Suspense>
      </FlagsProvider>
    )
    expect(await screen.findByText("dark UI")).toBeTruthy()
    expect(screen.getByText("not light")).toBeTruthy()
  })

  it("renders the fallback when the evaluation falls back to a matching default", async () => {
    const flags = createFlags({
      identify: () => ({ distinctId: "core" }),
      provider: defineProvider({
        decideOne: () => {
          throw new Error("provider down")
        },
        name: "down",
      }),
    })
    const enabledByDefault = flag.boolean("enabled", true)
    await renderAsync(
      <FlagsProvider flags={flags}>
        <FeatureFlag flag={enabledByDefault} loading="loading" fallback={<span>fallback</span>}>
          <span>on</span>
        </FeatureFlag>
        <FeatureFlag
          flag={theme}
          match="light"
          loading="loading"
          fallback={<span>variant fallback</span>}
        >
          <span>light</span>
        </FeatureFlag>
      </FlagsProvider>
    )
    expect(await screen.findByText("fallback")).toBeTruthy()
    expect(await screen.findByText("variant fallback")).toBeTruthy()
  })
})

describe("flag cache bounds", () => {
  it("evicts the least recently used settled evaluation", async () => {
    const { decideOne, flags } = makeFlags()
    const { capture, controls } = captureCache()
    const options = { maxEntries: 2 }
    const { rerender } = render(identityTree(flags, "first", options, capture))
    const prefetchAs = async (distinctId: string) => {
      rerender(identityTree(flags, distinctId, options, capture))
      await controls().prefetch([beta])
    }

    await prefetchAs("first")
    await prefetchAs("second")
    await sleep(1)
    await prefetchAs("first")
    await prefetchAs("third")
    await sleep(1)
    expect(decideOne).toHaveBeenCalledTimes(3)

    await prefetchAs("second")
    expect(decideOne).toHaveBeenCalledTimes(4)
    await prefetchAs("third")
    expect(decideOne).toHaveBeenCalledTimes(4)
  })

  it("expires settled evaluations after ttl", async () => {
    let now = 0
    const dateNow = vi.spyOn(Date, "now").mockImplementation(() => now)
    try {
      const { decideOne, flags } = makeFlags()
      const { capture, controls } = captureCache()
      render(
        <FlagsProvider flags={flags} cache={{ ttl: "100ms" }}>
          {capture}
        </FlagsProvider>
      )
      await controls().prefetch([beta])
      now = 50
      await controls().prefetch([beta])
      expect(decideOne).toHaveBeenCalledTimes(1)

      now = 201
      await controls().prefetch([beta])
      expect(decideOne).toHaveBeenCalledTimes(2)
    } finally {
      dateNow.mockRestore()
    }
  })

  it("expires a pending evaluation after pendingTtl", async () => {
    let now = 0
    const dateNow = vi.spyOn(Date, "now").mockImplementation(() => now)
    try {
      const pending = Promise.withResolvers<null>()
      const decideOne = vi.fn(async () => {
        await pending.promise
        return decision.boolean(true)
      })
      const flags = createFlags({
        cache: { coalesce: false },
        identify: () => ({ distinctId: "core" }),
        provider: defineProvider({ decideOne, name: "slow" }),
      })
      const { capture, controls } = captureCache()
      render(
        <FlagsProvider flags={flags} cache={{ pendingTtl: 100 }}>
          {capture}
        </FlagsProvider>
      )
      const first = controls().prefetch([beta])
      await sleep(1)
      now = 50
      const second = controls().prefetch([beta])
      await sleep(1)
      expect(decideOne).toHaveBeenCalledTimes(1)
      now = 150
      const third = controls().prefetch([beta])
      await sleep(1)
      expect(decideOne).toHaveBeenCalledTimes(2)
      pending.resolve(null)
      await Promise.all([first, second, third])
    } finally {
      dateNow.mockRestore()
    }
  })
})

describe("server rendering", () => {
  it("renders from the snapshot on the server and hydrates without a mismatch or provider call", async () => {
    const identity = { distinctId: "user" }
    const { html, snapshot } = await serverRender(identity)
    expect(html).toContain("true:dark")
    expect(html).toContain("on")

    const client = makeFlags("bulk")
    const container = mount(html)
    const recoverable: unknown[] = []
    const silenced = silenceConsoleError()
    try {
      await act(async () => {
        hydrate(container, <App flags={client.flags} identity={identity} snapshot={snapshot} />, {
          onRecoverableError: (error) => recoverable.push(error),
        })
        await sleep(1)
      })
      expect(recoverable).toEqual([])
      expect(silenced.errors).toEqual([])
    } finally {
      silenced.restore()
    }
    expect(container.textContent).toContain("true:dark")
    expect(client.decide).not.toHaveBeenCalled()
    expect(client.decideOne).not.toHaveBeenCalled()
  })

  it("uses the snapshot when the provider has no identity", async () => {
    const { html, snapshot } = await serverRender({ distinctId: "core" })
    const client = makeFlags("bulk")
    const container = mount(html)
    await act(async () => {
      hydrate(container, <App flags={client.flags} snapshot={snapshot} />)
      await sleep(1)
    })
    expect(container.textContent).toContain("true:dark")
    expect(client.decide).not.toHaveBeenCalled()
  })

  it("ignores a snapshot made for another identity and evaluates", async () => {
    const { snapshot } = await serverRender({ distinctId: "server-user" })
    const client = makeFlags("bulk")
    client.state.value = false
    await renderAsync(
      <App flags={client.flags} identity={{ distinctId: "client-user" }} snapshot={snapshot} />
    )
    expect(await screen.findByText("false:dark")).toBeTruthy()
    expect(client.seen).toContain("client-user")
  })

  it.each([
    '{"distinctId":"core"}',
    '{"distinctId":true,"flags":{"beta":{"kind":"boolean","source":"cache","value":true}}}',
    "null",
  ])("ignores a snapshot that does not parse and evaluates: %s", async (json) => {
    const client = makeFlags("bulk")
    client.state.value = false
    // A snapshot crosses the network as JSON, so the provider cannot trust its shape.
    const malformed = JSON.parse(json) as FlagSnapshot
    await renderAsync(<App flags={client.flags} snapshot={malformed} />)
    expect(await screen.findByText("false:dark")).toBeTruthy()
  })

  it("ignores snapshot entries with an unknown source", async () => {
    const client = makeFlags("bulk")
    client.state.value = false
    const snapshot = JSON.parse(
      '{"distinctId":"core","flags":{"beta":{"kind":"boolean","source":"guess","value":true},"theme":{"kind":"variant","source":"provider","value":"dark"}}}'
    ) as FlagSnapshot
    await renderAsync(<App flags={client.flags} snapshot={snapshot} />)
    expect(await screen.findByText("false:dark")).toBeTruthy()
    expect(client.decide).toHaveBeenCalled()
  })

  it("evaluates the flags that a snapshot could not evaluate for want of an identity", async () => {
    const failed = createFlags({
      identify: () => {
        throw new Error("no session")
      },
      provider: fakeProvider(),
    })
    // The server's identity failed, so the snapshot holds defaults and no distinctId.
    const snapshot = await failed.snapshot([beta, theme])
    expect(snapshot.distinctId).toBeNull()
    const client = createFlags({ provider: fakeProvider([[beta, true]]) })
    await renderAsync(
      <FlagsProvider flags={client} identity={anonymous} snapshot={snapshot}>
        <Suspense fallback="loading">
          <BetaAndTheme />
        </Suspense>
      </FlagsProvider>
    )
    expect(await screen.findByText("true:light")).toBeTruthy()
  })

  it("keeps a dropped snapshot value dropped when the provider remounts", async () => {
    const identity = { distinctId: "user" }
    const { snapshot } = await serverRender(identity)
    const client = makeFlags("bulk")
    client.state.value = false
    const tree = (key: string) => (
      <App key={key} flags={client.flags} identity={identity} snapshot={snapshot} />
    )
    const { rerender } = await renderAsync(tree("first"))
    expect(await screen.findByText("true:dark")).toBeTruthy()

    act(() => {
      client.emit(["beta"])
    })
    expect(await screen.findByText("false:dark")).toBeTruthy()

    // A new key remounts the provider with the same snapshot object.
    await act(() => {
      rerender(tree("second"))
      return Promise.resolve()
    })
    expect(await screen.findByText("false:dark")).toBeTruthy()
  })

  it("keeps a reader's dropped snapshot values when another reader uses the snapshot", async () => {
    const identity = { distinctId: "user" }
    const { snapshot } = await serverRender(identity)
    const first = makeFlags("bulk")
    const second = makeFlags("bulk")
    first.state.value = false
    const tree = (flags: TestFlags, key: string) => (
      <App key={key} flags={flags} identity={identity} snapshot={snapshot} />
    )
    const { rerender } = await renderAsync(tree(first.flags, "a"))
    act(() => {
      first.emit(["beta"])
    })
    expect(await screen.findByText("false:dark")).toBeTruthy()

    // Another reader reads the same snapshot object, then the first reader mounts again.
    await act(() => {
      rerender(tree(second.flags, "b"))
      return Promise.resolve()
    })
    expect(await screen.findByText("true:dark")).toBeTruthy()
    await act(() => {
      rerender(tree(first.flags, "c"))
      return Promise.resolve()
    })
    expect(await screen.findByText("false:dark")).toBeTruthy()
  })

  it("drops a snapshot value after a change notification and evaluates", async () => {
    const identity = { distinctId: "user" }
    const { html, snapshot } = await serverRender(identity)
    const client = makeFlags("bulk")
    const container = mount(html)
    await act(async () => {
      hydrate(container, <App flags={client.flags} identity={identity} snapshot={snapshot} />)
      await sleep(1)
    })
    expect(client.decide).not.toHaveBeenCalled()

    client.state.value = false
    act(() => {
      client.emit(["beta"])
    })
    // The batch evaluates in a timer-driven flush round, so wait for it instead of a fixed delay.
    await waitFor(() => {
      expect(container.textContent).toBe("false:darkoff")
    })
    expect(client.decide).toHaveBeenCalled()
  })

  it("ignores a snapshot entry whose kind or value does not fit the flag", async () => {
    const client = makeFlags("bulk")
    const snapshot: FlagSnapshot = {
      distinctId: "user",
      flags: {
        beta: { kind: "variant", source: "provider", value: "dark" },
        theme: { kind: "variant", source: "provider", value: "blue" },
      },
    }
    await renderAsync(
      <App flags={client.flags} identity={{ distinctId: "user" }} snapshot={snapshot} />
    )
    expect(await screen.findByText("true:dark")).toBeTruthy()
    // One call for the batch and one for FeatureFlag's own read of `beta`.
    expect(client.decide).toHaveBeenCalledTimes(2)
  })

  it("drops snapshot values through the hook cache", async () => {
    const client = makeFlags("bulk")
    const { capture, controls } = captureCache()
    const snapshot: FlagSnapshot = {
      distinctId: "user",
      flags: {
        beta: { kind: "boolean", source: "provider", value: false },
        theme: { kind: "variant", source: "provider", value: "light" },
      },
    }
    await renderAsync(
      <FlagsProvider flags={client.flags} identity={{ distinctId: "user" }} snapshot={snapshot}>
        {capture}
        <Suspense fallback="loading">
          <Value item={beta} />
          <Value item={theme} />
        </Suspense>
      </FlagsProvider>
    )
    expect(screen.getByText("false")).toBeTruthy()
    expect(screen.getByText("light")).toBeTruthy()
    await act(() => {
      controls().invalidate([beta])
      return Promise.resolve()
    })
    expect(await screen.findByText("true")).toBeTruthy()
    expect(screen.getByText("light")).toBeTruthy()
    await act(() => {
      controls().clear()
      return Promise.resolve()
    })
    expect(await screen.findByText("dark")).toBeTruthy()
  })
})
