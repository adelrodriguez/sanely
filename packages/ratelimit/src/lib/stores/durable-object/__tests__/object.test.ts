import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { fixedWindow } from "#lib/algorithms/index.ts"

// Runs in workerd: `pnpm run test:durable-object-store`.

function object() {
  return env.RATE_LIMITS.getByName(`test:${crypto.randomUUID()}`)
}

function saved(stub: ReturnType<typeof object>) {
  return runInDurableObject(stub, async (_, { storage }) => ({
    alarm: await storage.getAlarm(),
    state: storage.kv.get("state"),
  }))
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

const hour = fixedWindow({ limit: 5, window: 3_600_000 })

describe("RateLimitObject", () => {
  it("sets an alarm at the expiry of the first state it saves", async () => {
    const stub = object()
    const result = await stub.consume({ algorithm: hour, cost: 1 })

    expect(await saved(stub)).toEqual({
      alarm: result.reset,
      state: { count: 1, expiresAt: result.reset, type: "fixedWindow", window: expect.any(Number) },
    })
  })

  it("saves nothing and sets no alarm for a cost of 0", async () => {
    const stub = object()
    await stub.consume({ algorithm: hour, cost: 0 })

    expect(await saved(stub)).toEqual({ alarm: null, state: undefined })
  })

  it("saves nothing and sets no alarm for a denial", async () => {
    const stub = object()
    await stub.consume({ algorithm: hour, cost: 6 })

    expect(await saved(stub)).toEqual({ alarm: null, state: undefined })
  })

  it("keeps a state that has not expired when its alarm runs early", async () => {
    const stub = object()
    const result = await stub.consume({ algorithm: hour, cost: 2 })

    expect(await runDurableObjectAlarm(stub)).toBe(true)
    expect(await saved(stub)).toMatchObject({ alarm: result.reset, state: { count: 2 } })
    expect(await stub.consume({ algorithm: hour, cost: 0 })).toMatchObject({ remaining: 3 })
  })

  it("deletes the state when it expires", async () => {
    const stub = object()
    const short = fixedWindow({ limit: 5, window: 100 })
    const result = await stub.consume({ algorithm: short, cost: 1 })

    await sleep(result.reset - result.now + 50)
    // The alarm may already have run on its own, so this runs it only when it is still set.
    await runDurableObjectAlarm(stub)

    expect(await saved(stub)).toEqual({ alarm: null, state: undefined })
  })

  it("keeps counts and its alarm when the runtime evicts the object", async () => {
    const stub = object()
    const result = await stub.consume({ algorithm: hour, cost: 3 })

    await evictDurableObject(stub)
    await stub.consume({ algorithm: hour, cost: 1 })

    expect(await saved(stub)).toMatchObject({ alarm: result.reset, state: { count: 4 } })
  })

  it("removes the state and the alarm on clear", async () => {
    const stub = object()
    await stub.consume({ algorithm: hour, cost: 1 })
    await stub.clear()

    expect(await saved(stub)).toEqual({ alarm: null, state: undefined })
    expect(await stub.consume({ algorithm: hour, cost: 0 })).toMatchObject({ remaining: 5 })
  })
})
