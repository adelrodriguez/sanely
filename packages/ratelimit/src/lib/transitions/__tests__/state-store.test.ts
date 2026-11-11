import { describe, expect, it } from "vitest"
import { fixedWindow, slidingWindow, tokenBucket } from "#lib/algorithms/index.ts"
import { testStore } from "#lib/store/__tests__/conformance.ts"
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
