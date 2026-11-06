import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { act, cleanup, render, waitFor } from "@testing-library/react"
import { StrictMode } from "react"
import { renderToString } from "react-dom/server"
import { describe, expect, expectTypeOf, it, onTestFinished, vi } from "vitest"
import type {
  DeploymentSource,
  DeploymentStatus,
  DeploymentStatusOptions,
} from "#integrations/react/index.ts"
import { useDeploymentStatus } from "#integrations/react/index.ts"
import { getMonitor, resetRegistry } from "#lib/runtime/registry.ts"

/**
 * Registers the happy-dom globals for the current test. When the test finishes, it unmounts the
 * rendered trees, resets the monitor registry, and removes the globals.
 */
function setupDom(): void {
  GlobalRegistrator.register()

  onTestFinished(async () => {
    cleanup()
    resetRegistry()
    await GlobalRegistrator.unregister()
  })
}

function Status(): React.ReactNode {
  const deployment = useDeploymentStatus({ checkOnSubscribe: false })
  return <output>{`${deployment.status}:${deployment.reloadStatus}`}</output>
}

function SourceStatus({
  id,
  options,
  states,
}: {
  readonly id: string
  readonly options: DeploymentStatusOptions
  readonly states: Map<string, DeploymentStatus>
}): React.ReactNode {
  const deployment = useDeploymentStatus(options)
  states.set(id, deployment)
  return <output>{deployment.status}</output>
}

function InlineStatus({ source }: { readonly source: DeploymentSource }) {
  const deployment = useDeploymentStatus({ checkInterval: 20_000, source })
  return <output>{deployment.status}</output>
}

function InlinePredicateStatus({
  label,
  source,
}: {
  readonly label: string
  readonly source: DeploymentSource
}): React.ReactNode {
  const deployment = useDeploymentStatus({
    checkOnSubscribe: false,
    isCurrent: (running, target) => running.id !== target.id,
    source,
  })
  return <output>{`${label}:${deployment.status}`}</output>
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
  it("renders unknown with the browser and server reload status", () => {
    expect.assertions(3)
    setupDom()
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {
      /* silence the expected inert-monitor warning */
    })
    onTestFinished(() => {
      warning.mockRestore()
    })

    const view = render(<Status />)

    expect(view.getByText("unknown:ready")).toBeDefined()
    expect(renderToString(<Status />)).toContain("unknown:unprotected")
    expect(warning).toHaveBeenCalledWith(expect.stringContaining("no adapter registered"))
  })

  it("shares one target resolution and state reference between components", async () => {
    expect.hasAssertions()
    setupDom()
    let calls = 0
    const states = new Map<string, DeploymentStatus>()
    const options = {
      checkInterval: 20_000,
      source: {
        resolveTarget: () => {
          calls += 1
          return Promise.resolve({ id: "running" })
        },
        running: { id: "running" },
      },
    } satisfies DeploymentStatusOptions

    const view = render(
      <>
        <SourceStatus id="first" options={options} states={states} />
        <SourceStatus id="second" options={options} states={states} />
      </>
    )

    await waitFor(() => {
      expect(view.getAllByText("current")).toHaveLength(2)
    })

    expect(calls).toBe(1)
    expect(states.get("first")).toBe(states.get("second"))
  })

  it("does not resubscribe when an inline options literal is shallow-equal", async () => {
    expect.hasAssertions()
    setupDom()
    let calls = 0
    const source: DeploymentSource = {
      resolveTarget: () => {
        calls += 1
        return Promise.resolve({ id: "running" })
      },
      running: { id: "running" },
    }

    const view = render(<InlineStatus source={source} />)

    await waitFor(() => {
      expect(view.getByText("current")).toBeDefined()
    })
    await Promise.resolve()

    expect(calls).toBe(1)
  })

  it("keeps one initial check through Strict Mode mount churn", async () => {
    expect.hasAssertions()
    setupDom()
    let calls = 0
    const source: DeploymentSource = {
      resolveTarget: () => {
        calls += 1
        return Promise.resolve({ id: "running" })
      },
      running: { id: "running" },
    }

    const view = render(
      <StrictMode>
        <InlineStatus source={source} />
      </StrictMode>
    )

    await waitFor(() => {
      expect(view.getByText("current")).toBeDefined()
    })

    expect(calls).toBe(1)
  })

  it("uses the isCurrent predicate supplied to the hook", async () => {
    expect.hasAssertions()
    setupDom()
    const states = new Map<string, DeploymentStatus>()
    const options = {
      checkInterval: 20_000,
      isCurrent: () => false,
      source: {
        resolveTarget: () => Promise.resolve({ id: "running" }),
        running: { id: "running" },
      },
    } satisfies DeploymentStatusOptions

    const view = render(<SourceStatus id="is-current" options={options} states={states} />)

    await waitFor(() => {
      expect(view.getByText("stale")).toBeDefined()
    })

    const state = states.get("is-current")
    assertStale(state)
    expectTypeOf(state.status).toEqualTypeOf<"stale">()
    expectTypeOf(state.target).toEqualTypeOf<{ readonly builtAt?: Date; readonly id: string }>()
    expectTypeOf(state.checkedAt).toEqualTypeOf<Date>()
  })

  it("applies an inline isCurrent predicate across parent rerenders", async () => {
    expect.assertions(2)
    setupDom()
    const source: DeploymentSource = {
      resolveTarget: () => Promise.resolve({ id: "running" }),
      running: { id: "running" },
    }

    const view = render(<InlinePredicateStatus label="first" source={source} />)
    view.rerender(<InlinePredicateStatus label="second" source={source} />)

    expect(view.getByText("second:unknown")).toBeDefined()

    await act(async () => {
      await getMonitor(source).check()
    })

    expect(view.getByText("second:stale")).toBeDefined()
  })

  it("keeps a stale notice mounted throughout a later check", async () => {
    expect.assertions(4)
    setupDom()
    let nextTarget = Promise.resolve({ id: "target" })
    let finish: (deployment: { id: string }) => void = missingResolver
    const source: DeploymentSource = {
      resolveTarget: () => nextTarget,
      running: { id: "running" },
    }
    const states = new Map<string, DeploymentStatus>()
    const view = render(
      <SourceStatus id="notice" options={{ checkOnSubscribe: false, source }} states={states} />
    )
    const monitor = getMonitor(source)

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
