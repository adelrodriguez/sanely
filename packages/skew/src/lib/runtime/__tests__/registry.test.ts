import { describe, expect, it, onTestFinished } from "vitest"
import type { DeploymentSource } from "#lib/protocol/types.ts"
import { getDefaultMonitor, getMonitor, resetRegistry } from "#lib/runtime/registry.ts"

function isolateRegistry(): void {
  onTestFinished(() => {
    globalThis.__CRISPEN__ = undefined
    resetRegistry()
  })
}

describe("deployment monitor registry", () => {
  it("shares one monitor per source object identity", () => {
    expect.assertions(2)
    isolateRegistry()

    const firstSource: DeploymentSource = {
      resolveTarget: () => Promise.resolve({ id: "first" }),
      running: { id: "first" },
    }
    const secondSource: DeploymentSource = {
      resolveTarget: () => Promise.resolve({ id: "second" }),
      running: { id: "second" },
    }

    expect(getMonitor(firstSource)).toBe(getMonitor(firstSource))
    expect(getMonitor(firstSource)).not.toBe(getMonitor(secondSource))
  })

  it("replaces a shared monitor after it is destroyed", () => {
    expect.assertions(1)
    isolateRegistry()

    const source: DeploymentSource = {
      resolveTarget: () => Promise.resolve({ id: "first" }),
      running: { id: "first" },
    }
    const monitor = getMonitor(source)

    monitor.destroy()

    expect(getMonitor(source)).not.toBe(monitor)
  })

  it("starts a new weak registry when reset", () => {
    expect.assertions(1)
    isolateRegistry()

    const source: DeploymentSource = {
      resolveTarget: () => Promise.resolve({ id: "first" }),
      running: { id: "first" },
    }
    const monitor = getMonitor(source)

    resetRegistry()

    expect(getMonitor(source)).not.toBe(monitor)
  })

  it("replaces the default monitor after it is destroyed", () => {
    expect.assertions(1)
    isolateRegistry()

    globalThis.__CRISPEN__ = {
      running: { id: "running" },
      v: 1,
    }
    const monitor = getDefaultMonitor()

    monitor.destroy()

    expect(getDefaultMonitor()).not.toBe(monitor)
  })

  it("lazily creates one default monitor from the embed", () => {
    expect.assertions(2)
    isolateRegistry()

    globalThis.__CRISPEN__ = {
      running: { id: "running" },
      v: 1,
    }

    const monitor = getDefaultMonitor()

    expect(getDefaultMonitor()).toBe(monitor)
    expect(monitor.getState().running).toStrictEqual({ id: "running" })
  })
})
