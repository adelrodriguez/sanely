import { InvalidTimeExpressionError } from "@sanely/duration"
import { describe, expect, it, onTestFinished, vi } from "vitest"
import type { Deployment, TargetResolver } from "#lib/protocol/types.ts"
import type { DeploymentMonitorOptions } from "#lib/runtime/monitor.ts"
import { TargetResolutionError } from "#lib/protocol/errors.ts"
import { createDeploymentMonitor } from "#lib/runtime/monitor.ts"
import { FakeEnvironment, MemoryStorage } from "./helpers.ts"

const TEST_TIME = 10 ** 3

interface TestSource {
  readonly running: Deployment
  readonly resolveTarget: TargetResolver
}

// Creates a monitor for a running deployment and its target, or an inert monitor without one.
function monitorOf<const T extends string = never>(
  source: TestSource | undefined,
  options: DeploymentMonitorOptions<T> = {}
) {
  return createDeploymentMonitor(
    source === undefined
      ? options
      : { running: source.running, target: source.resolveTarget, ...options }
  )
}

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

class ControlledSource implements TestSource {
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

async function loadStalePageAndReload(environment: FakeEnvironment) {
  const monitor = monitorOf(
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
    const monitor = monitorOf(
      { resolveTarget: neverSettles, running: { id: "running" } },
      { checkInterval: "1m", checkOnSubscribe: false, checkTimeout: "2s", environment }
    )
    const unsubscribe = monitor.subscribe(noop)
    onTestFinished(unsubscribe)

    void monitor.check()
    await Promise.resolve()

    expect(environment.timeoutDelays).toStrictEqual([2000])
    expect(environment.intervalDelays).toStrictEqual([60_000])
  })

  it("rejects a string that is not a time expression", () => {
    const environment = new FakeEnvironment()
    const source = { resolveTarget: neverSettles, running: { id: "running" } }
    expect(() => monitorOf(source, { checkTimeout: "soon" as "1s", environment })).toThrow(
      InvalidTimeExpressionError
    )
    expect(() => monitorOf(source, { checkInterval: "soon" as "1m", environment })).toThrow(
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

    const source: TestSource = {
      resolveTarget: () => Promise.resolve({ id: "running" }),
      running: { id: "running" },
    }
    const monitor = monitorOf(source)
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

    const monitor = monitorOf(
      {
        resolveTarget: () => Promise.resolve({ id: "running" }),
        running: { id: "running" },
      },
      { isCurrent: () => false }
    )

    await monitor.check()

    expect(monitor.getState().status).toBe("stale")
  })

  it("keeps the configured comparison when subscribers leave during a check", async () => {
    let resolveTarget: (deployment: Deployment) => void = missingResolver
    const target = new Promise<Deployment>((resolve) => {
      resolveTarget = resolve
    })
    const monitor = createDeploymentMonitor({
      checkOnSubscribe: false,
      environment: new FakeEnvironment(),
      isCurrent: () => true,
      running: { id: "running" },
      target: () => target,
    })
    const first: string[] = []
    const second: string[] = []
    const unsubscribeFirst = monitor.subscribe((state) => first.push(state.status))
    const unsubscribeSecond = monitor.subscribe((state) => second.push(state.status))
    onTestFinished(unsubscribeFirst)
    onTestFinished(unsubscribeSecond)

    const check = monitor.check()
    resolveTarget({ id: "different" })
    await check
    expect(first.at(-1)).toBe("current")
    expect(second.at(-1)).toBe("current")

    const nextCheck = monitor.check()
    unsubscribeFirst()
    await nextCheck
    expect(second.at(-1)).toBe("current")
    expect(monitor.getState().status).toBe("current")
  })

  it("keeps durable status while a successful check updates target knowledge", async () => {
    expect.assertions(5)

    let resolveTarget: (deployment: { id: string }) => void = missingResolver
    const target = new Promise<{ id: string }>((resolve) => {
      resolveTarget = resolve
    })
    const source: TestSource = {
      resolveTarget: () => target,
      running: { id: "running" },
    }
    const environment = new FakeEnvironment()
    environment.setNow(TEST_TIME)
    const monitor = monitorOf(source, { checkTimeout: 50, environment })

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
    const source: TestSource = {
      resolveTarget: () => target,
      running: { id: "running" },
    }
    const environment = new FakeEnvironment()
    environment.setNow(TEST_TIME)
    const monitor = monitorOf(source, { environment })

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

    const source: TestSource = {
      resolveTarget: () => Promise.resolve({ id: "running" }),
      running: { id: "running" },
    }
    const monitor = monitorOf(source, { checkOnSubscribe: false })
    const initial = monitor.getState()
    const states: unknown[] = []
    const unsubscribe = monitor.subscribe((state) => {
      states.push(state)
    })

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
    const monitor = monitorOf({
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
    const monitor = monitorOf({
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
    expect.assertions(5)

    const environment = new FakeEnvironment()
    const monitor = monitorOf(
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
    expect(result).toMatchObject({ checkStatus: "idle", status: "unknown" })
    expect(result.error).toBeInstanceOf(TargetResolutionError)
    expect(result.error).toMatchObject({ cause: { checkTimeout: 50 }, reason: "timeout" })
    expect(environment.timeoutDelays).toStrictEqual([])
  })

  it("recovers after a timed-out source ignores abort", async () => {
    expect.assertions(3)

    const source = new ControlledSource(neverSettles)
    const environment = new FakeEnvironment()
    const monitor = monitorOf(source, { checkTimeout: 50, environment })

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
    const monitor = monitorOf(source, { checkTimeout: 50, environment })

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
    const monitor = monitorOf(source, { checkTimeout: 50, environment })

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
    const monitor = monitorOf(
      { resolveTarget: neverSettles, running: { id: "running" } },
      { checkOnSubscribe: false, environment }
    )
    const unsubscribe = monitor.subscribe(noop)
    const cancelledCheck = monitor.check()

    expect(environment.timeoutDelays).toStrictEqual([30_000])

    unsubscribe()
    await Promise.resolve()

    expect(environment.intervalDelays).toStrictEqual([])
    expect(environment.timeoutDelays).toStrictEqual([])

    await cancelledCheck

    expect(monitor.getState().error).toBeNull()
  })

  it("shares the result of a timed-out check across concurrent callers", async () => {
    expect.assertions(3)

    const environment = new FakeEnvironment()
    const monitor = monitorOf(
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
    expect(firstResult.error).toMatchObject({ reason: "timeout" })
  })

  it("stays inert without an embedded deployment source", async () => {
    expect.assertions(5)

    let warned = false
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {
      warned = true
    })
    const environment = new FakeEnvironment()
    const monitor = monitorOf(undefined, { environment })
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

  it("keeps the initial check through Strict Mode subscription churn", async () => {
    expect.assertions(3)

    let calls = 0
    let finish: (deployment: { id: string }) => void = missingResolver
    let targetSignal: AbortSignal | undefined
    const target = new Promise<{ id: string }>((resolve) => {
      finish = resolve
    })
    const monitor = monitorOf({
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
    const monitor = monitorOf(source)

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

      monitorOf(
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
      const monitor = monitorOf(
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
      const monitor = monitorOf(
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
      const monitor = monitorOf(
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
      const monitor = monitorOf(
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
      const monitor = monitorOf(
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

    it("counts several reload requests in one page as one reload", async () => {
      expect.assertions(4)

      const storage = new MemoryStorage()
      const environment = new FakeEnvironment(storage)
      const first = await loadStalePageAndReload(environment)
      first.reload()
      first.reload()

      expect(first.getState().reloadStatus).toBe("ready")
      expect(environment.reloadCalls).toBe(3)

      const second = await loadStalePageAndReload(environment)

      expect(second.getState().reloadStatus).toBe("ready")

      const third = await loadStalePageAndReload(environment)

      expect(third.getState().reloadStatus).toBe("blocked")
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
      await loadStalePageAndReload(environment)
      await loadStalePageAndReload(environment)
      let target = "B"
      const monitor = monitorOf(
        {
          resolveTarget: () => Promise.resolve({ id: target }),
          running: { id: "A" },
        },
        { environment }
      )
      await monitor.check()
      monitor.reload()
      expect(monitor.getState().reloadStatus).toBe("blocked")

      target = "C"
      await monitor.check()

      expect(monitor.getState().reloadStatus).toBe("ready")
    })
  })
})

function setEmbed(embed: NonNullable<typeof globalThis.__DEPLOYMENT_CHECK__>): void {
  globalThis.__DEPLOYMENT_CHECK__ = embed
  onTestFinished(() => {
    globalThis.__DEPLOYMENT_CHECK__ = undefined
  })
}

function stubDescriptorFetch(id: string) {
  const fetch = vi.fn((_input: string | URL | Request) =>
    Promise.resolve(
      new Response(`{"v":1,"id":"${id}"}`, { headers: { "content-type": "application/json" } })
    )
  )
  vi.stubGlobal("fetch", fetch)
  onTestFinished(() => {
    vi.unstubAllGlobals()
  })
  return fetch
}

describe("monitor defaults", () => {
  it("reads the running deployment and the endpoint from the embed", async () => {
    expect.assertions(3)

    setEmbed({
      endpoint: "/app/deployment.json",
      running: { builtAt: "2026-11-10T00:00:00.000Z", id: "embedded" },
      v: 1,
    })
    const fetch = stubDescriptorFetch("target")
    const monitor = createDeploymentMonitor({ environment: new FakeEnvironment() })

    const state = await monitor.check()

    expect(state.running).toStrictEqual({
      builtAt: new Date("2026-11-10T00:00:00.000Z"),
      id: "embedded",
    })
    expect(state.status).toBe("stale")
    expect(fetch.mock.calls[0]?.[0]).toBe("/app/deployment.json")
  })

  it("fetches the default endpoint when the embed names none", async () => {
    expect.assertions(1)

    setEmbed({ running: { id: "embedded" }, v: 1 })
    const fetch = stubDescriptorFetch("embedded")

    await createDeploymentMonitor({ environment: new FakeEnvironment() }).check()

    expect(fetch.mock.calls[0]?.[0]).toBe("/_deployment-check/deployment.json")
  })

  it("prefers the running option and a target URL over the embed", async () => {
    expect.assertions(2)

    setEmbed({ endpoint: "/embedded.json", running: { id: "embedded" }, v: 1 })
    const fetch = stubDescriptorFetch("preview")
    const monitor = createDeploymentMonitor({
      environment: new FakeEnvironment(),
      running: { id: "preview" },
      target: "https://deployments.example.com/current.json",
    })

    const state = await monitor.check()

    expect(state).toMatchObject({ running: { id: "preview" }, status: "current" })
    expect(fetch.mock.calls[0]?.[0]).toBe("https://deployments.example.com/current.json")
  })
})
