import { describe, expect, test, vi } from "vitest"
import { flag } from "#lib/definition/index.ts"
import { anonymous } from "#lib/identity/index.ts"
import { fakeProvider, memoryStore } from "#testing/index.ts"

const betaAccess = flag.boolean("beta-access", false)
const theme = flag.variant("theme", ["light", "dark"], "light")
const options = { signal: new AbortController().signal }

describe("fakeProvider", () => {
  test("answers with the values it was given and leaves out other flags", async () => {
    const provider = fakeProvider([
      [betaAccess, true],
      [theme, "dark", { accent: "red" }],
    ])
    const other = flag.boolean("other", false)

    expect(provider.name).toBe("fake")
    await expect(
      Promise.resolve(provider.decide?.([betaAccess, theme, other], anonymous, options))
    ).resolves.toEqual({
      "beta-access": { type: "boolean", value: true },
      theme: { payload: { accent: "red" }, type: "variant", variant: "dark" },
    })
  })

  test("starts empty without entries", async () => {
    await expect(
      Promise.resolve(fakeProvider().decide?.([betaAccess], { distinctId: 1 }, options))
    ).resolves.toEqual({})
  })

  test("sets a value and notifies subscribers with its key", async () => {
    const provider = fakeProvider()
    const notify = vi.fn()
    const unsubscribe = provider.subscribe?.(notify)

    provider.set(theme, "light")
    expect(notify).toHaveBeenCalledWith(["theme"])
    await expect(Promise.resolve(provider.decide?.([theme], anonymous, options))).resolves.toEqual({
      theme: { type: "variant", variant: "light" },
    })

    unsubscribe?.()
    provider.set(betaAccess, false)
    expect(notify).toHaveBeenCalledTimes(1)
  })
})

describe("memoryStore", () => {
  test("gets, sets, and deletes decisions", async () => {
    const store = memoryStore()
    const decision = { type: "boolean", value: true } as const

    await expect(store.get("k")).resolves.toBeUndefined()
    await store.set("k", decision, { flagKey: "beta" })
    await expect(store.get("k")).resolves.toEqual(decision)
    await expect(store.delete?.("k")).resolves.toBe(true)
    await expect(store.get("k")).resolves.toBeUndefined()
  })

  test("deletes the decisions of the named flags, or of every flag", async () => {
    const store = memoryStore()
    const decision = { type: "boolean", value: true } as const
    await store.set("a1", decision, { flagKey: "a" })
    await store.set("a2", decision, { flagKey: "a" })
    await store.set("b1", decision, { flagKey: "b" })

    await store.deleteFlags?.(["a"])
    await expect(store.get("a1")).resolves.toBeUndefined()
    await expect(store.get("a2")).resolves.toBeUndefined()
    await expect(store.get("b1")).resolves.toEqual(decision)

    await store.deleteFlags?.()
    await expect(store.get("b1")).resolves.toBeUndefined()
  })
})
