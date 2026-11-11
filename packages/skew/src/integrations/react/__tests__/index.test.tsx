import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { act, cleanup, render, waitFor } from "@testing-library/react"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { describe, expect, expectTypeOf, it, onTestFinished, vi } from "vitest"
import type { DeploymentMonitor, DeploymentStatus } from "#integrations/react/index.ts"
import { useDeploymentStatus } from "#integrations/react/index.ts"
import { createDeploymentMonitor } from "#lib/runtime/monitor.ts"

/**
 * Registers the happy-dom globals for the current test. When the test finishes, it unmounts the
 * rendered trees and removes the globals.
 */
function setupDom(): void {
  GlobalRegistrator.register()

  onTestFinished(async () => {
    await act(() => {
      cleanup()
      return Promise.resolve()
    })
    await GlobalRegistrator.unregister()
  })
}

/**
 * Imports the hook with a new default monitor, so each test reads the embed it sets.
 */
async function importFreshHook() {
  vi.resetModules()
  const module = await import("#integrations/react/index.ts")
  return module.useDeploymentStatus
}

function StatusOf({
  id,
  monitor,
  states,
}: {
  readonly id: string
  readonly monitor: DeploymentMonitor
  readonly states: Map<string, DeploymentStatus>
}): React.ReactNode {
  const deployment = useDeploymentStatus(monitor)
  states.set(id, deployment)
  return <output>{deployment.status}</output>
}

function countingMonitor(target = "running") {
  const counter = { calls: 0 }
  const monitor = createDeploymentMonitor({
    checkInterval: 20_000,
    running: { id: "running" },
    target: () => {
      counter.calls += 1
      return Promise.resolve({ id: target })
    },
  })
  return { counter, monitor }
}

function assertStale(
  state: DeploymentStatus | undefined
): asserts state is DeploymentStatus & { readonly status: "stale" } {
  if (state?.status !== "stale") {
    throw new Error("Expected the hook state to narrow to stale")
  }
}

function missingResolver(): never {
  throw new Error("The test resolver was not initialized")
}

describe("react deployment integration", () => {
  it("finishes queued React work before removing the DOM", () => {
    setupDom()
    const container = document.createElement("div")
    const root = createRoot(container)

    // Leave a scheduler callback queued even though the root has already unmounted.
    root.render(<output>pending</output>)
    root.unmount()

    expect(container.childNodes).toHaveLength(0)
    // The test runner also checks for unhandled errors after setupDom's teardown.
  })

  it("renders unknown with the browser and server reload status", async () => {
    expect.assertions(3)
    setupDom()
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {
      /* silence the expected inert-monitor warning */
    })
    onTestFinished(() => {
      warning.mockRestore()
    })
    const useFreshStatus = await importFreshHook()
    function DefaultStatus(): React.ReactNode {
      const deployment = useFreshStatus()
      return <output>{`${deployment.status}:${deployment.reloadStatus}`}</output>
    }

    const view = render(<DefaultStatus />)

    expect(view.getByText("unknown:ready")).toBeDefined()
    expect(renderToString(<DefaultStatus />)).toContain("unknown:unprotected")
    expect(warning).toHaveBeenCalledWith(expect.stringContaining("no adapter registered"))
  })

  it("uses a default monitor that reads the embed", async () => {
    expect.hasAssertions()
    setupDom()
    globalThis.__DEPLOYMENT_CHECK__ = { running: { id: "running" }, v: 1 }
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        new Response('{"v":1,"id":"target"}', { headers: { "content-type": "application/json" } })
      )
    )
    onTestFinished(() => {
      globalThis.__DEPLOYMENT_CHECK__ = undefined
      vi.unstubAllGlobals()
    })
    const useFreshStatus = await importFreshHook()
    function DefaultStatus(): React.ReactNode {
      return <output>{useFreshStatus().status}</output>
    }

    const view = render(
      <>
        <DefaultStatus />
        <DefaultStatus />
      </>
    )

    await waitFor(() => {
      expect(view.getAllByText("stale")).toHaveLength(2)
    })
  })

  it("shares one target resolution and state reference between components", async () => {
    expect.hasAssertions()
    setupDom()
    const { counter, monitor } = countingMonitor()
    const states = new Map<string, DeploymentStatus>()

    const view = render(
      <>
        <StatusOf id="first" monitor={monitor} states={states} />
        <StatusOf id="second" monitor={monitor} states={states} />
      </>
    )

    await waitFor(() => {
      expect(view.getAllByText("current")).toHaveLength(2)
    })

    expect(counter.calls).toBe(1)
    expect(states.get("first")).toBe(states.get("second"))
  })

  it("does not check again when the component rerenders", async () => {
    expect.hasAssertions()
    setupDom()
    const { counter, monitor } = countingMonitor()
    const states = new Map<string, DeploymentStatus>()

    const view = render(<StatusOf id="first" monitor={monitor} states={states} />)
    await waitFor(() => {
      expect(view.getByText("current")).toBeDefined()
    })
    view.rerender(<StatusOf id="second" monitor={monitor} states={states} />)
    await Promise.resolve()

    expect(counter.calls).toBe(1)
  })

  it("keeps one initial check through Strict Mode mount churn", async () => {
    expect.hasAssertions()
    setupDom()
    const { counter, monitor } = countingMonitor()

    const view = render(
      <StrictMode>
        <StatusOf id="strict" monitor={monitor} states={new Map()} />
      </StrictMode>
    )

    await waitFor(() => {
      expect(view.getByText("current")).toBeDefined()
    })

    expect(counter.calls).toBe(1)
  })

  it("narrows a stale state to its target and check time", async () => {
    expect.hasAssertions()
    setupDom()
    const { monitor } = countingMonitor("target")
    const states = new Map<string, DeploymentStatus>()

    const view = render(<StatusOf id="stale" monitor={monitor} states={states} />)

    await waitFor(() => {
      expect(view.getByText("stale")).toBeDefined()
    })

    const state = states.get("stale")
    assertStale(state)
    expectTypeOf(state.status).toEqualTypeOf<"stale">()
    expectTypeOf(state.target).toEqualTypeOf<{ readonly builtAt?: Date; readonly id: string }>()
    expectTypeOf(state.checkedAt).toEqualTypeOf<Date>()
  })

  it("keeps a stale notice mounted throughout a later check", async () => {
    expect.assertions(4)
    setupDom()
    let nextTarget = Promise.resolve({ id: "target" })
    let finish: (deployment: { id: string }) => void = missingResolver
    const monitor = createDeploymentMonitor({
      checkOnSubscribe: false,
      running: { id: "running" },
      target: () => nextTarget,
    })
    const states = new Map<string, DeploymentStatus>()
    const view = render(<StatusOf id="notice" monitor={monitor} states={states} />)

    await act(async () => {
      await monitor.check()
    })
    expect(view.getByText("stale")).toBeDefined()

    nextTarget = new Promise((resolve) => {
      finish = resolve
    })
    let pendingCheck: Promise<DeploymentStatus> | undefined
    act(() => {
      pendingCheck = monitor.check()
    })

    expect(view.getByText("stale")).toBeDefined()
    expect(states.get("notice")?.checkStatus).toBe("checking")

    finish({ id: "target" })
    await act(async () => {
      await pendingCheck
    })

    expect(view.getByText("stale")).toBeDefined()
  })
})
