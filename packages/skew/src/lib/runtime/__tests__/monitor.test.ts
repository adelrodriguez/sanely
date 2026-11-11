import { InvalidTimeExpressionError } from "@sanely/duration"
import { describe, expect, it, onTestFinished, vi } from "vitest"
import type { Deployment, DeploymentSource } from "#lib/protocol/types.ts"
import { DEFAULT_CHECK_TIMEOUT, createDeploymentMonitor } from "#lib/runtime/monitor.ts"
import { FakeEnvironment, MemoryStorage } from "./helpers.ts"

const TEST_TIME = 10 ** 3

function missingResolver(): never {
  throw new Error("The test resolver was not initialized")
}

function noop(): boolean {
  return false
}

function neverSettles(): Promise<never> {
  return new Promise(() => {
    noop()
  })
}

function resolveRunning(): Promise<Deployment> {
  return Promise.resolve({ id: "running" })
}

class ControlledSource implements DeploymentSource {
  calls = 0
  respond: () => Promise<Deployment>
  readonly running: Deployment = { id: "running" }
  signal: AbortSignal | undefined

  constructor(respond: () => Promise<Deployment>) {
    this.respond = respond
  }

  resolveTarget = (signal: AbortSignal): Promise<Deployment> => {
    this.calls += 1
    this.signal = signal
    return this.respond()
  }
}

function createPredicateScheduleMonitor() {
  const environment = new FakeEnvironment()
  const monitor = createDeploymentMonitor(
    {
      resolveTarget: () => Promise.resolve({ id: "running" }),
      running: { id: "running" },
    },
    { environment }
  )
  const unsubscribePriority = monitor.subscribe(noop, {
    checkInterval: 30_000,
    checkOnReconnect: false,
    checkOnSubscribe: false,
    checkOnVisible: false,
    isCurrent: () => true,
  })
  const unsubscribeSchedule = monitor.subscribe(noop, {
    checkInterval: 20_000,
    checkOnReconnect: true,
    checkOnSubscribe: false,
    checkOnVisible: true,
    isCurrent: () => false,
  })

  return { environment, monitor, unsubscribePriority, unsubscribeSchedule }
}

async function loadStalePageAndReload(environment: FakeEnvironment) {
  const monitor = createDeploymentMonitor(
    {
      resolveTarget: () => Promise.resolve({ id: "B" }),
      running: { id: "A" },
    },
    { environment }
  )
  await monitor.check()
  monitor.reload()

  return monitor
}

describe("deployment monitor", () => {
  it("reads checkTimeout and checkInterval given as time expressions", async () => {
    const environment = new FakeEnvironment()
    const monitor = createDeploymentMonitor(
      { resolveTarget: neverSettles, running: { id: "running" } },
      { checkTimeout: "2s", environment }
    )
    const unsubscribe = monitor.subscribe(noop, { checkInterval: "1m", checkOnSubscribe: false })
    onTestFinished(unsubscribe)

    void monitor.check()
    await Promise.resolve()

    expect(environment.timeoutDelays).toStrictEqual([2000])
    expect(environment.intervalDelays).toStrictEqual([60_000])
  })

  it("rejects a string that is not a time expression", () => {
    const environment = new FakeEnvironment()
    const source = { resolveTarget: neverSettles, running: { id: "running" } }
    const monitor = createDeploymentMonitor(source, { environment })

    expect(() => createDeploymentMonitor(source, { checkTimeout: "soon" as "1s" })).toThrow(
      InvalidTimeExpressionError
    )
    expect(() => monitor.subscribe(noop, { checkInterval: "soon" as "1m" })).toThrow(
      InvalidTimeExpressionError
    )
  })

  it("starts with stable unknown state for the running deployment", () => {
    expect.assertions(2)
    // Newer Node.js versions, such as 26, define a global `sessionStorage`. Remove it, so the
    // browser environment has no storage on every Node.js version.
    vi.stubGlobal("sessionStorage", null)
    onTestFinished(() => {
      vi.unstubAllGlobals()
    })

    const source: DeploymentSource = {
      resolveTarget: () => Promise.resolve({ id: "running" }),
      running: { id: "running" },
    }
    const monitor = createDeploymentMonitor(source)
    const state = monitor.getState()

    expect(state).toMatchObject({
      checkStatus: "idle",
      checkedAt: null,
      error: null,
      reloadStatus: "unprotected",
      running: { id: "running" },
      status: "unknown",
      target: null,
    })
    expect(monitor.getState()).toBe(state)
  })

  it("uses the configured isCurrent predicate", async () => {
    expect.assertions(1)

    const monitor = createDeploymentMonitor(
      {
        resolveTarget: () => Promise.resolve({ id: "running" }),
        running: { id: "running" },
      },
      { isCurrent: () => false }
    )

    await monitor.check()

    expect(monitor.getState().status).toBe("stale")
  })

  it("uses the earliest active explicit subscriber predicate for one shared verdict", async () => {
    expect.assertions(2)

    const monitor = createDeploymentMonitor({
      resolveTarget: () => Promise.resolve({ id: "running" }),
      running: { id: "running" },
    })
    const unsubscribeFirst = monitor.subscribe(noop, {
      checkOnSubscribe: false,
      isCurrent: () => true,
    })
    const unsubscribeSecond = monitor.subscribe(noop, {
      checkOnSubscribe: false,
      isCurrent: () => false,
    })

    await monitor.check()
    expect(monitor.getState().status).toBe("current")

    unsubscribeFirst()
    await monitor.check()
    expect(monitor.getState().status).toBe("stale")

    unsubscribeSecond()
  })

  it("skips option-free subscribers when it selects the active predicate", async () => {
    expect.assertions(1)

    const monitor = createDeploymentMonitor({
      resolveTarget: () => Promise.resolve({ id: "running" }),
      running: { id: "running" },
    })
    const unsubscribeWithoutPredicate = monitor.subscribe(noop, { checkOnSubscribe: false })
    const unsubscribeExplicit = monitor.subscribe(noop, {
      checkOnSubscribe: false,
      isCurrent: () => false,
    })

    await monitor.check()

    expect(monitor.getState().status).toBe("stale")
    unsubscribeExplicit()
    unsubscribeWithoutPredicate()
  })

  it("returns to the monitor default after all explicit predicates leave", async () => {
    expect.assertions(2)

    const monitor = createDeploymentMonitor({
      resolveTarget: () => Promise.resolve({ id: "running" }),
      running: { id: "running" },
    })
    const unsubscribeDefault = monitor.subscribe(noop, { checkOnSubscribe: false })
    const unsubscribeExplicit = monitor.subscribe(noop, {
      checkOnSubscribe: false,
      isCurrent: () => false,
    })

    await monitor.check()
    expect(monitor.getState().status).toBe("stale")

    unsubscribeExplicit()
    await monitor.check()
    expect(monitor.getState().status).toBe("current")

    unsubscribeDefault()
  })

  it("keeps the subscriber schedule union while the earliest predicate decides", async () => {
    expect.assertions(4)

    const { environment, monitor, unsubscribePriority, unsubscribeSchedule } =
      createPredicateScheduleMonitor()

    await monitor.check()

    expect(monitor.getState().status).toBe("current")
    expect(environment.intervalDelays).toStrictEqual([20_000])
    expect(environment.listenerCount("online")).toBe(1)
    expect(environment.listenerCount("pageshow")).toBe(1)

    unsubscribePriority()
    unsubscribeSchedule()
  })

  it("keeps the schedule when the priority predicate subscriber leaves", async () => {
    expect.assertions(4)

    const { environment, monitor, unsubscribePriority, unsubscribeSchedule } =
      createPredicateScheduleMonitor()

    await monitor.check()
    unsubscribePriority()
    await monitor.check()

    expect(monitor.getState().status).toBe("stale")
    expect(environment.intervalDelays).toStrictEqual([20_000])
    expect(environment.listenerCount("online")).toBe(1)
    expect(environment.listenerCount("pageshow")).toBe(1)

    unsubscribeSchedule()
  })

  it("keeps durable status while a successful check updates target knowledge", async () => {
    expect.assertions(5)

    let resolveTarget: (deployment: { id: string }) => void = missingResolver
    const target = new Promise<{ id: string }>((resolve) => {
      resolveTarget = resolve
    })
    const source: DeploymentSource = {
      resolveTarget: () => target,
      running: { id: "running" },
    }
    const environment = new FakeEnvironment()
    environment.setNow(TEST_TIME)
    const monitor = createDeploymentMonitor(source, { checkTimeout: 50, environment })

    const check = monitor.check()

    expect(environment.timeoutDelays).toStrictEqual([50])
    expect(monitor.getState()).toMatchObject({
      checkStatus: "checking",
      status: "unknown",
    })

    resolveTarget({ id: "running" })
    const result = await check

    expect(result).toBe(monitor.getState())
    expect(result).toMatchObject({
      checkStatus: "idle",
      checkedAt: new Date(TEST_TIME),
      error: null,
      status: "current",
      target: { id: "running" },
    })
    expect(environment.timeoutDelays).toStrictEqual([])
  })

  it("keeps stale knowledge when a later check fails", async () => {
    expect.assertions(3)

    const failure = new Error("offline")
    let target = Promise.resolve({ id: "target" })
    const source: DeploymentSource = {
      resolveTarget: () => target,
      running: { id: "running" },
    }
    const environment = new FakeEnvironment()
    environment.setNow(TEST_TIME)
    const monitor = createDeploymentMonitor(source, { environment })

    await monitor.check()
    target = Promise.reject(failure)
    const failedCheck = monitor.check()

    expect(monitor.getState()).toMatchObject({
      checkStatus: "checking",
      status: "stale",
    })

    const result = await failedCheck

    expect(result).toBe(monitor.getState())
    expect(result).toMatchObject({
      checkStatus: "idle",
      error: failure,
      status: "stale",
      target: { id: "target" },
    })
  })

  it("notifies subscribers with a new immutable state for each change", async () => {
    expect.assertions(3)

    const source: DeploymentSource = {
      resolveTarget: () => Promise.resolve({ id: "running" }),
      running: { id: "running" },
    }
    const monitor = createDeploymentMonitor(source)
    const initial = monitor.getState()
    const states: unknown[] = []
    const unsubscribe = monitor.subscribe(
      (state) => {
        states.push(state)
      },
      { checkOnSubscribe: false }
    )

    await monitor.check()
    unsubscribe()

    expect(states).toHaveLength(2)
    expect(states[0]).not.toBe(initial)
    expect(states[1]).not.toBe(states[0])
  })

  it("shares one target resolution across concurrent checks", async () => {
    expect.assertions(4)

    let calls = 0
    let finish: (deployment: { id: string }) => void = missingResolver
    const target = new Promise<{ id: string }>((resolve) => {
      finish = resolve
    })
    const monitor = createDeploymentMonitor({
      resolveTarget: () => {
        calls += 1
        return target
      },
      running: { id: "running" },
    })

    const first = monitor.check()
    const second = monitor.check()

    expect(second).toBe(first)
    expect(calls).toBe(1)

    finish({ id: "running" })
    const [firstResult, secondResult] = await Promise.all([first, second])

    expect(firstResult).toBe(monitor.getState())
    expect(secondResult).toBe(firstResult)
  })

  it("aborts an in-flight check when the last subscriber leaves", async () => {
    expect.assertions(4)

    let targetSignal: AbortSignal | undefined
    const monitor = createDeploymentMonitor({
      resolveTarget: (signal) => {
        targetSignal = signal
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted", "AbortError"))
          })
        })
      },
      running: { id: "running" },
    })
    const unsubscribe = monitor.subscribe(noop)
    const check = monitor.check()

    expect(targetSignal?.aborted).toBe(false)
    unsubscribe()
    await Promise.resolve()
    expect(targetSignal?.aborted).toBe(true)

    const result = await check
    expect(result).toBe(monitor.getState())
    expect(result).toMatchObject({
      checkStatus: "idle",
      error: null,
    })
  })

  it("finishes a never-settling check when its timeout expires", async () => {
    expect.assertions(3)

    const environment = new FakeEnvironment()
    const monitor = createDeploymentMonitor(
      {
        resolveTarget: neverSettles,
        running: { id: "running" },
      },
      { checkTimeout: 50, environment }
    )

    const check = monitor.check()
    environment.fireTimeouts()
    const result = await check

    expect(result).toBe(monitor.getState())
    expect(result).toMatchObject({
      checkStatus: "idle",
      error: new Error("[deployment-check] The deployment check timed out after 50ms."),
      status: "unknown",
    })
    expect(environment.timeoutDelays).toStrictEqual([])
  })

  it("recovers after a timed-out source ignores abort", async () => {
    expect.assertions(3)

    const source = new ControlledSource(neverSettles)
    const environment = new FakeEnvironment()
    const monitor = createDeploymentMonitor(source, { checkTimeout: 50, environment })

    const timedOut = monitor.check()
    environment.fireTimeouts()
    await timedOut

    expect(source.signal?.aborted).toBe(true)

    source.respond = resolveRunning
    const recovered = await monitor.check()

    expect(recovered).toMatchObject({ error: null, status: "current" })
    expect(source.calls).toBe(2)
  })

  it("preserves current and stale knowledge through later timeouts", async () => {
    expect.assertions(3)

    const source = new ControlledSource(resolveRunning)
    const environment = new FakeEnvironment()
    environment.setNow(TEST_TIME)
    const monitor = createDeploymentMonitor(source, { checkTimeout: 50, environment })

    await monitor.check()
    const currentState = monitor.getState()
    source.respond = neverSettles
    const currentTimeout = monitor.check()
    environment.fireTimeouts()
    await currentTimeout
    expect(monitor.getState()).toMatchObject({
      checkedAt: currentState.checkedAt,
      status: "current",
      target: { id: "running" },
    })

    source.respond = () => Promise.resolve({ id: "target" })
    environment.setNow(TEST_TIME + 1)
    await monitor.check()
    expect(monitor.getState()).toMatchObject({ error: null, status: "stale" })

    const staleState = monitor.getState()
    source.respond = neverSettles
    const staleTimeout = monitor.check()
    environment.fireTimeouts()
    await staleTimeout
    expect(monitor.getState()).toMatchObject({
      checkedAt: staleState.checkedAt,
      status: "stale",
      target: { id: "target" },
    })
  })

  it("ignores a late result from a timed-out check", async () => {
    expect.assertions(1)

    let finishFirst: (deployment: { id: string }) => void = missingResolver
    const firstTarget = new Promise<{ id: string }>((resolve) => {
      finishFirst = resolve
    })
    const source = new ControlledSource(() => firstTarget)
    const environment = new FakeEnvironment()
    const monitor = createDeploymentMonitor(source, { checkTimeout: 50, environment })

    const firstCheck = monitor.check()
    environment.fireTimeouts()
    await firstCheck
    source.respond = () => Promise.resolve({ id: "newer" })
    await monitor.check()

    finishFirst({ id: "running" })
    await Promise.resolve()

    expect(monitor.getState()).toMatchObject({ status: "stale", target: { id: "newer" } })
  })

  it("clears timeout work after the last unsubscribe", async () => {
    expect.assertions(4)

    const environment = new FakeEnvironment()
    const monitor = createDeploymentMonitor(
      { resolveTarget: neverSettles, running: { id: "running" } },
      { environment }
    )
    const unsubscribe = monitor.subscribe(noop, { checkOnSubscribe: false })
    const cancelledCheck = monitor.check()

    expect(environment.timeoutDelays).toStrictEqual([DEFAULT_CHECK_TIMEOUT])

    unsubscribe()
    await Promise.resolve()

    expect(environment.intervalDelays).toStrictEqual([])
    expect(environment.timeoutDelays).toStrictEqual([])

    await cancelledCheck

    expect(monitor.getState().error).toBeNull()
  })

  it("clears timeout work after destruction", async () => {
    expect.assertions(4)

    const environment = new FakeEnvironment()
    const monitor = createDeploymentMonitor(
      { resolveTarget: neverSettles, running: { id: "running" } },
      { environment }
    )
    monitor.subscribe(noop, { checkOnSubscribe: false })
    const destroyedCheck = monitor.check()

    expect(environment.timeoutDelays).toStrictEqual([DEFAULT_CHECK_TIMEOUT])

    monitor.destroy()

    expect(environment.intervalDelays).toStrictEqual([])
    expect(environment.timeoutDelays).toStrictEqual([])

    await destroyedCheck

    expect(monitor.getState().error).toBeNull()
  })

  it("shares the result of a timed-out check across concurrent callers", async () => {
    expect.assertions(3)

    const environment = new FakeEnvironment()
    const monitor = createDeploymentMonitor(
      {
        resolveTarget: neverSettles,
        running: { id: "running" },
      },
      { checkTimeout: 50, environment }
    )

    const first = monitor.check()
    const second = monitor.check()
    expect(second).toBe(first)

    environment.fireTimeouts()
    const [firstResult, secondResult] = await Promise.all([first, second])

    expect(secondResult).toBe(firstResult)
    expect(firstResult.error?.message).toBe(
      "[deployment-check] The deployment check timed out after 50ms."
    )
  })

  it("stays inert without an embedded deployment source", async () => {
    expect.assertions(5)

    let warned = false
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {
      warned = true
    })
    const environment = new FakeEnvironment()
    const monitor = createDeploymentMonitor(undefined, { environment })
    const unsubscribe = monitor.subscribe(noop)

    const result = await monitor.check()

    expect(warned).toBe(false)
    expect(result).toBe(monitor.getState())
    expect(result.status).toBe("unknown")
    expect(environment.intervalDelays).toStrictEqual([])
    expect(environment.listenerCount("visibilitychange")).toBe(0)

    unsubscribe()
    warning.mockRestore()
  })

  it("stays terminal after destruction", async () => {
    expect.assertions(5)

    let checks = 0
    const environment = new FakeEnvironment()
    const monitor = createDeploymentMonitor(
      {
        resolveTarget: () => {
          checks += 1
          return Promise.resolve({ id: "running" })
        },
        running: { id: "running" },
      },
      { environment }
    )
    const unsubscribe = monitor.subscribe(noop, { checkOnSubscribe: false })

    monitor.destroy()
    monitor.destroy()
    const state = monitor.getState()
    const unsubscribeAfterDestroy = monitor.subscribe(noop)
    const result = await monitor.check()
    monitor.reload()

    expect(result).toBe(state)
    expect(checks).toBe(0)
    expect(environment.intervalDelays).toStrictEqual([])
    expect(environment.listenerCount("visibilitychange")).toBe(0)
    expect(environment.reloadCalls).toBe(0)

    unsubscribe()
    unsubscribeAfterDestroy()
  })

  it("keeps the initial check through Strict Mode subscription churn", async () => {
    expect.assertions(3)

    let calls = 0
    let finish: (deployment: { id: string }) => void = missingResolver
    let targetSignal: AbortSignal | undefined
    const target = new Promise<{ id: string }>((resolve) => {
      finish = resolve
    })
    const monitor = createDeploymentMonitor({
      resolveTarget: (signal) => {
        calls += 1
        targetSignal = signal
        return target
      },
      running: { id: "running" },
    })

    const unsubscribeFirst = monitor.subscribe(noop)
    const firstCheck = monitor.check()
    unsubscribeFirst()
    const unsubscribeSecond = monitor.subscribe(noop)

    await Promise.resolve()

    expect(calls).toBe(1)
    expect(targetSignal?.aborted).toBe(false)

    finish({ id: "running" })
    await firstCheck

    expect(monitor.getState().status).toBe("current")

    unsubscribeSecond()
  })

  it("starts a fresh check when Strict Mode resubscribes after cancellation", async () => {
    expect.assertions(3)

    const source = new ControlledSource(neverSettles)
    const monitor = createDeploymentMonitor(source)

    const unsubscribeFirst = monitor.subscribe(noop)
    const cancelledCheck = monitor.check()
    unsubscribeFirst()
    await Promise.resolve()

    source.respond = resolveRunning
    const unsubscribeSecond = monitor.subscribe(noop)
    const result = await monitor.check()

    await expect(cancelledCheck).resolves.toMatchObject({ checkStatus: "idle", status: "unknown" })
    expect(result).toMatchObject({ error: null, status: "current" })
    expect(source.calls).toBe(2)

    unsubscribeSecond()
  })

  describe("reload", () => {
    it("blocks a third reload that repeatedly lands on the same deployment", async () => {
      expect.assertions(4)

      const storage = new MemoryStorage()
      const environment = new FakeEnvironment(storage)

      const first = await loadStalePageAndReload(environment)

      expect(first.getState().reloadStatus).toBe("ready")

      const second = await loadStalePageAndReload(environment)

      expect(second.getState().reloadStatus).toBe("ready")

      const third = await loadStalePageAndReload(environment)

      expect(third.getState().reloadStatus).toBe("blocked")
      expect(environment.reloadCalls).toBe(2)
    })

    it("clears the marker after reload advances to the target deployment", async () => {
      expect.assertions(3)

      const storage = new MemoryStorage()
      const environment = new FakeEnvironment(storage)
      await loadStalePageAndReload(environment)

      createDeploymentMonitor(
        {
          resolveTarget: () => Promise.resolve({ id: "B" }),
          running: { id: "B" },
        },
        { environment }
      )

      const first = await loadStalePageAndReload(environment)

      expect(first.getState().reloadStatus).toBe("ready")

      const second = await loadStalePageAndReload(environment)

      expect(second.getState().reloadStatus).toBe("ready")

      expect(environment.reloadCalls).toBe(3)
    })

    it("starts unprotected when session storage cannot be read", async () => {
      expect.assertions(3)

      const environment = new FakeEnvironment({
        getItem: () => {
          throw new Error("storage unavailable")
        },
        removeItem: () => {
          throw new Error("storage unavailable")
        },
        setItem: () => {
          throw new Error("storage unavailable")
        },
      })
      const monitor = createDeploymentMonitor(
        {
          resolveTarget: () => Promise.resolve({ id: "B" }),
          running: { id: "A" },
        },
        { environment }
      )

      expect(monitor.getState().reloadStatus).toBe("unprotected")
      await monitor.check()
      monitor.reload()

      expect(environment.reloadCalls).toBe(1)
      expect(monitor.getState().reloadStatus).toBe("unprotected")
    })

    it("becomes unprotected when session storage cannot be written", async () => {
      expect.assertions(4)

      const environment = new FakeEnvironment({
        getItem: () => null,
        removeItem: () => {
          // There is no marker to remove.
        },
        setItem: () => {
          throw new Error("storage unavailable")
        },
      })
      const monitor = createDeploymentMonitor(
        {
          resolveTarget: () => Promise.resolve({ id: "B" }),
          running: { id: "A" },
        },
        { environment }
      )

      expect(monitor.getState().reloadStatus).toBe("ready")
      await monitor.check()
      monitor.reload()

      expect(environment.reloadCalls).toBe(1)
      expect(monitor.getState().reloadStatus).toBe("unprotected")

      await monitor.check()
      expect(monitor.getState().reloadStatus).toBe("unprotected")
    })

    it("starts unprotected when a successful reload marker cannot be cleared", () => {
      expect.assertions(1)

      const environment = new FakeEnvironment({
        getItem: () => JSON.stringify({ at: 0, attempts: 0, from: "A", to: "B" }),
        removeItem: () => {
          throw new Error("storage unavailable")
        },
        setItem: () => {
          // An unprotected monitor does not write another marker.
        },
      })
      const monitor = createDeploymentMonitor(
        {
          resolveTarget: () => Promise.resolve({ id: "B" }),
          running: { id: "B" },
        },
        { environment }
      )

      expect(monitor.getState().reloadStatus).toBe("unprotected")
    })

    it("ignores a malformed reload marker without disabling protection", () => {
      expect.assertions(1)

      const environment = new FakeEnvironment({
        getItem: () => "not-json",
        removeItem: () => {
          // A malformed marker is ignored.
        },
        setItem: () => {
          // This test does not request a reload.
        },
      })
      const monitor = createDeploymentMonitor(
        {
          resolveTarget: () => Promise.resolve({ id: "B" }),
          running: { id: "A" },
        },
        { environment }
      )

      expect(monitor.getState().reloadStatus).toBe("ready")
    })

    it("reloads without protection when session storage is unavailable", async () => {
      expect.assertions(2)

      const environment = new FakeEnvironment(null)
      const monitor = createDeploymentMonitor(
        {
          resolveTarget: () => Promise.resolve({ id: "B" }),
          running: { id: "A" },
        },
        { environment }
      )
      await monitor.check()

      monitor.reload()

      expect(environment.reloadCalls).toBe(1)
      expect(monitor.getState().reloadStatus).toBe("unprotected")
    })

    it("starts a new reload sequence after the cooldown", async () => {
      expect.assertions(2)

      const storage = new MemoryStorage()
      const environment = new FakeEnvironment(storage)
      await loadStalePageAndReload(environment)
      await loadStalePageAndReload(environment)

      environment.setNow(10 * 60_000)
      const monitor = await loadStalePageAndReload(environment)

      expect(environment.reloadCalls).toBe(3)
      expect(monitor.getState().reloadStatus).toBe("ready")
    })

    it("clears a blocked reload when the target deployment changes", async () => {
      expect.assertions(2)

      const storage = new MemoryStorage()
      const environment = new FakeEnvironment(storage)
      let target = "B"
      const monitor = createDeploymentMonitor(
        {
          resolveTarget: () => Promise.resolve({ id: target }),
          running: { id: "A" },
        },
        { environment }
      )
      await monitor.check()
      monitor.reload()
      monitor.reload()
      monitor.reload()
      expect(monitor.getState().reloadStatus).toBe("blocked")

      target = "C"
      await monitor.check()

      expect(monitor.getState().reloadStatus).toBe("ready")
    })
  })
})
