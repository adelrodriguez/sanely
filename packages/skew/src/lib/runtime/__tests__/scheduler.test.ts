import { describe, expect, it, vi } from "vitest"
import type { DeploymentMonitorOptions } from "#lib/runtime/monitor.ts"
import { createDeploymentMonitor } from "#lib/runtime/monitor.ts"
import { FakeEnvironment } from "./helpers.ts"

function noop(): boolean {
  return false
}

function createScheduledMonitor(options: DeploymentMonitorOptions = {}) {
  const environment = new FakeEnvironment()
  const monitor = createDeploymentMonitor({
    checkInterval: 20_000,
    checkOnSubscribe: false,
    environment,
    running: { id: "running" },
    target: () => Promise.resolve({ id: "running" }),
    ...options,
  })

  return { environment, monitor }
}

function createCountingMonitor() {
  const counter = { checks: 0 }
  const { environment, monitor } = createScheduledMonitor({
    target: () => {
      counter.checks += 1
      return Promise.resolve({ id: "running" })
    },
  })
  const unsubscribe = monitor.subscribe(noop)

  return { counter, environment, monitor, unsubscribe }
}

describe("deployment scheduler", () => {
  it("attaches the interval and listeners on the first subscriber", () => {
    expect.assertions(4)

    const { environment, monitor } = createScheduledMonitor()

    const unsubscribe = monitor.subscribe(noop)

    expect(environment.intervalDelays).toStrictEqual([20_000])
    expect(environment.listenerCount("visibilitychange")).toBe(1)
    expect(environment.listenerCount("pageshow")).toBe(1)
    expect(environment.listenerCount("online")).toBe(1)

    unsubscribe()
  })

  it("detaches the interval and listeners on the last unsubscribe", () => {
    expect.assertions(4)

    const { environment, monitor } = createScheduledMonitor()
    const unsubscribe = monitor.subscribe(noop)

    unsubscribe()

    expect(environment.intervalDelays).toStrictEqual([])
    expect(environment.listenerCount("visibilitychange")).toBe(0)
    expect(environment.listenerCount("pageshow")).toBe(0)
    expect(environment.listenerCount("online")).toBe(0)
  })

  it("honors a check interval above the default", () => {
    expect.assertions(1)

    const { environment, monitor } = createScheduledMonitor({ checkInterval: 600_000 })

    const unsubscribe = monitor.subscribe(noop)

    expect(environment.intervalDelays).toStrictEqual([600_000])

    unsubscribe()
  })

  it("keeps one schedule while subscribers come and go", () => {
    expect.assertions(3)

    const { environment, monitor } = createScheduledMonitor()
    const unsubscribeFirst = monitor.subscribe(noop)
    const unsubscribeSecond = monitor.subscribe(noop)

    expect(environment.intervalStarts).toBe(1)

    unsubscribeFirst()

    expect(environment.intervalDelays).toStrictEqual([20_000])

    unsubscribeSecond()

    expect(environment.intervalDelays).toStrictEqual([])
  })

  it("attaches no trigger listener that the schedule turns off", () => {
    expect.assertions(3)

    const { environment, monitor } = createScheduledMonitor({
      checkOnReconnect: false,
      checkOnVisible: false,
    })
    const unsubscribe = monitor.subscribe(noop)

    expect(environment.listenerCount("visibilitychange")).toBe(1)
    expect(environment.listenerCount("pageshow")).toBe(0)
    expect(environment.listenerCount("online")).toBe(0)

    unsubscribe()
  })

  it("checks on visible intervals", async () => {
    expect.assertions(2)

    const { counter, environment, monitor, unsubscribe } = createCountingMonitor()

    environment.fireIntervals()

    expect(counter.checks).toBe(1)

    await monitor.check()

    expect(counter.checks).toBe(1)

    unsubscribe()
  })

  it("stops the interval while hidden and checks when visible again", async () => {
    expect.assertions(5)

    const { counter, environment, monitor, unsubscribe } = createCountingMonitor()

    environment.setVisible(false)
    environment.fire("visibilitychange")

    expect(environment.intervalDelays).toStrictEqual([])
    expect(counter.checks).toBe(0)

    environment.setVisible(true)
    environment.fire("visibilitychange")

    expect(counter.checks).toBe(1)

    await monitor.check()

    expect(counter.checks).toBe(1)
    expect(environment.intervalDelays).toStrictEqual([20_000])

    unsubscribe()
  })

  it("checks on persisted page restore only", async () => {
    expect.assertions(3)

    const { counter, environment, monitor, unsubscribe } = createCountingMonitor()

    environment.fire("pageshow", { persisted: false })

    expect(counter.checks).toBe(0)

    environment.fire("pageshow", { persisted: true })

    expect(counter.checks).toBe(1)

    await monitor.check()

    expect(counter.checks).toBe(1)

    unsubscribe()
  })

  it("checks on reconnect", async () => {
    expect.assertions(2)

    const { counter, environment, monitor, unsubscribe } = createCountingMonitor()

    environment.fire("online")

    expect(counter.checks).toBe(1)

    await monitor.check()

    expect(counter.checks).toBe(1)

    unsubscribe()
  })

  it("raises an excessive polling interval to the ten-second floor", () => {
    expect.assertions(2)

    let warned = false
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {
      warned = true
    })
    const { environment, monitor } = createScheduledMonitor({ checkInterval: 500 })

    const unsubscribe = monitor.subscribe(noop)

    expect(environment.intervalDelays).toStrictEqual([10_000])
    expect(warned).toBe(true)

    unsubscribe()
    warning.mockRestore()
  })
})
