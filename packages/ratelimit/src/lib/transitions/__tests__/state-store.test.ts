import { describe, expect, it } from "vitest"
import { fixedWindow } from "#lib/algorithms/index.ts"
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

  it.each([
    [
      "a count that is not a number",
      '{"type":"fixedWindow","window":0,"count":"5","expiresAt":2e12}',
    ],
    ["a missing field", '{"type":"fixedWindow","window":0,"expiresAt":2e12}'],
  ])("counts %s as no state", async (_case, row) => {
    // At time 0 the saved window 0 is the current window, so a saved count would apply.
    const store = jsonStore(new Map([["k", row]]), () => 0)
    const algorithm = fixedWindow({ limit: 5, window: 60_000 })

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
