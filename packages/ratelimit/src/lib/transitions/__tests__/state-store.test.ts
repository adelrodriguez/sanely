import { describe, expect, it } from "vitest"
import { fixedWindow, slidingWindow, tokenBucket } from "#lib/algorithms/index.ts"
import { testStore } from "#lib/store/__tests__/conformance.ts"
import { memoryStore } from "#lib/stores/memory/index.ts"
import { stateStore } from "#lib/transitions/state-store.ts"

// A store that keeps each state as JSON, as a database row would. JavaScript runs `update` to the
// end before any other call, which stands in for the database's transaction.
function jsonStore(rows = new Map<string, string>(), clock = Date.now) {
  return stateStore({
    clear: (key) => {
      rows.delete(key)
      return Promise.resolve()
    },
    update: (key, apply) => {
      const row = rows.get(key)
      const { result, state } = apply(row === undefined ? undefined : JSON.parse(row), clock())

      if (state !== undefined) rows.set(key, JSON.stringify(state))

      return Promise.resolve(result)
    },
  })
}

describe("stateStore", () => {
  testStore(() => jsonStore())

  // At time 0 the saved window 0 is the current window, and no token has refilled, so each saved
  // value would apply if the store read it as it is.
  it.each([
    {
      algorithm: fixedWindow({ limit: 5, window: 60_000 }),
      case: "a count that is not a number",
      row: '{"type":"fixedWindow","window":0,"count":"5","expiresAt":2e12}',
    },
    {
      algorithm: fixedWindow({ limit: 5, window: 60_000 }),
      case: "a missing count",
      row: '{"type":"fixedWindow","window":0,"expiresAt":2e12}',
    },
    {
      algorithm: slidingWindow({ limit: 5, window: 60_000 }),
      case: "a sliding count that is not a number",
      row: '{"type":"slidingWindow","window":0,"current":"5","previous":0,"expiresAt":2e12}',
    },
    {
      algorithm: fixedWindow({ limit: 5, window: 60_000 }),
      case: "an algorithm it does not know",
      row: '{"type":"leakyBucket","window":0,"count":5,"expiresAt":2e12}',
    },
    {
      algorithm: tokenBucket({ capacity: 5, interval: 60_000, refillRate: 1 }),
      case: "tokens that are not a number",
      row: '{"type":"tokenBucket","tokens":"x","refilledAt":0,"expiresAt":2e12}',
    },
  ])("counts $case as no state", async ({ algorithm, row }) => {
    const store = jsonStore(new Map([["k", row]]), () => 0)

    expect(await store.consume({ algorithm, cost: 1, key: "k" })).toMatchObject({
      remaining: 4,
      success: true,
    })
  })

  // The guide lets a database delete expired rows whenever it suits it, so a store that keeps them
  // must answer like the memory store, which forgets each state at its expiry.
  it("answers like the memory store when it keeps a row past its expiry", async () => {
    let now = 0
    const kept = jsonStore(new Map(), () => now)
    const memory = memoryStore({ clock: () => now })
    const algorithm = tokenBucket({ capacity: 1, interval: 1000, refillRate: 1 })

    for (const time of [0, 1500, 2000]) {
      now = time
      // oxlint-disable-next-line eslint/no-await-in-loop -- Each request must see the state the one before it left.
      const expected = await memory.consume({ algorithm, cost: 1, key: "k" })

      // oxlint-disable-next-line eslint/no-await-in-loop -- As above.
      expect(await kept.consume({ algorithm, cost: 1, key: "k" })).toEqual(expected)
    }
  })

  // A database clock can carry fractions of a millisecond, such as an epoch from Postgres.
  it("keeps counting when the store's clock has fractions of a millisecond", async () => {
    let now = 1000.5
    const store = jsonStore(new Map(), () => now)
    const algorithm = tokenBucket({ capacity: 2, interval: 1000, refillRate: 1 })

    await store.consume({ algorithm, cost: 1, key: "k" })
    now = 1000.75

    expect(await store.consume({ algorithm, cost: 1, key: "k" })).toMatchObject({
      now: 1000,
      remaining: 0,
      success: true,
    })
  })

  it("saves nothing for a denial or a read", async () => {
    const rows = new Map<string, string>()
    const store = jsonStore(rows)
    const algorithm = fixedWindow({ limit: 1, window: 60_000 })
    await store.consume({ algorithm, cost: 1, key: "k" })
    const saved = rows.get("k")

    await store.consume({ algorithm, cost: 1, key: "k" })
    await store.consume({ algorithm, cost: 0, key: "k" })

    expect(rows.get("k")).toBe(saved)
  })
})
