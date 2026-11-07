import { describe, expect, it, vi } from "vitest"
import { createDeploymentMonitor } from "#lib/runtime/monitor.ts"
import { FakeEnvironment } from "./helpers.ts"

function noop(): boolean {
  return false
}

function createScheduledMonitor() {
  const environment = new FakeEnvironment()
  const monitor = createDeploymentMonitor(
    {
      resolveTarget: () => Promise.resolve({ id: "running" }),
      running: { id: "running" },
    },
    { environment }
  )

  return { environment, monitor }
}

function createCountingMonitor() {
  const counter = { checks: 0 }
  const environment = new FakeEnvironment()
  const monitor = createDeploymentMonitor(
    {
      resolveTarget: () => {
        counter.checks += 1
        return Promise.resolve({ id: "running" })
      },
      running: { id: "running" },
    },
    { environment }
  )
  const unsubscribe = monitor.subscribe(noop, {
    checkInterval: 20_000,
    checkOnSubscribe: false,
  })

  return { counter, environment, monitor, unsubscribe }
}

function subscribeSlowAndFast(monitor: ReturnType<typeof createDeploymentMonitor>) {
  const unsubscribeSlow = monitor.subscribe(noop, {
    checkInterval: 30_000,
    checkOnReconnect: false,
    checkOnSubscribe: false,
    checkOnVisible: false,
  })
  const unsubscribeFast = monitor.subscribe(noop, {
    checkInterval: 20_000,
    checkOnReconnect: true,
    checkOnSubscribe: false,
    checkOnVisible: true,
  })

  return { unsubscribeFast, unsubscribeSlow }
}

describe("deployment scheduler", () => {
  it("attaches the interval and listeners on the first subscriber", () => {
    expect.assertions(4)

    const { environment, monitor } = createScheduledMonitor()

    const unsubscribe = monitor.subscribe(noop, {
      checkInterval: 20_000,
      checkOnSubscribe: false,
    })

    expect(environment.intervalDelays).toStrictEqual([20_000])
    expect(environment.listenerCount("visibilitychange")).toBe(1)
    expect(environment.listenerCount("pageshow")).toBe(1)
    expect(environment.listenerCount("online")).toBe(1)

    unsubscribe()
  })

  it("detaches the interval and listeners on the last unsubscribe", () => {
    expect.assertions(4)

    const { environment, monitor } = createScheduledMonitor()
    const unsubscribe = monitor.subscribe(noop, {
      checkInterval: 20_000,
      checkOnSubscribe: false,
    })

    unsubscribe()

    expect(environment.intervalDelays).toStrictEqual([])
    expect(environment.listenerCount("visibilitychange")).toBe(0)
    expect(environment.listenerCount("pageshow")).toBe(0)
    expect(environment.listenerCount("online")).toBe(0)
  })

  it("honors a check interval above the default", () => {
    expect.assertions(1)

    const { environment, monitor } = createScheduledMonitor()

    const unsubscribe = monitor.subscribe(noop, {
      checkInterval: 600_000,
      checkOnSubscribe: false,
    })

    expect(environment.intervalDelays).toStrictEqual([600_000])

    unsubscribe()
  })

  it("uses the shortest interval and trigger union across subscribers", () => {
    expect.assertions(3)

    const { environment, monitor } = createScheduledMonitor()
    const { unsubscribeFast, unsubscribeSlow } = subscribeSlowAndFast(monitor)

    expect(environment.intervalDelays).toStrictEqual([20_000])
    expect(environment.listenerCount("pageshow")).toBe(1)
    expect(environment.listenerCount("online")).toBe(1)

    unsubscribeFast()
    unsubscribeSlow()
  })

  it("recomputes the interval and triggers when a subscriber leaves", () => {
    expect.assertions(3)

    const { environment, monitor } = createScheduledMonitor()
    const { unsubscribeFast, unsubscribeSlow } = subscribeSlowAndFast(monitor)

    unsubscribeFast()

    expect(environment.intervalDelays).toStrictEqual([30_000])
    expect(environment.listenerCount("pageshow")).toBe(0)
    expect(environment.listenerCount("online")).toBe(0)

    unsubscribeSlow()
  })

  it("keeps the interval when subscriber churn does not change the schedule", () => {
    expect.assertions(2)

    const { environment, monitor } = createScheduledMonitor()
    const options = {
      checkInterval: 20_000,
      checkOnSubscribe: false,
    }
    const unsubscribeFirst = monitor.subscribe(noop, options)
    const unsubscribeSecond = monitor.subscribe(noop, options)

    expect(environment.intervalStarts).toBe(1)

    unsubscribeSecond()

    expect(environment.intervalStarts).toBe(1)

    unsubscribeFirst()
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
    const { environment, monitor } = createScheduledMonitor()

    const unsubscribe = monitor.subscribe(noop, {
      checkInterval: 500,
      checkOnSubscribe: false,
    })

    expect(environment.intervalDelays).toStrictEqual([10_000])
    expect(warned).toBe(true)

    unsubscribe()
    warning.mockRestore()
  })
})
