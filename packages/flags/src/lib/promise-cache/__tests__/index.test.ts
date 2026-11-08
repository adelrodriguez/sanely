import { describe, expect, test, vi } from "vitest"
import { evictOnRejection } from "#lib/promise-cache/index.ts"

describe("evictOnRejection", () => {
  test("resolves with the evaluation without evicting", async () => {
    const onRejected = vi.fn()

    await expect(evictOnRejection(Promise.resolve(1), onRejected)).resolves.toBe(1)
    expect(onRejected).not.toHaveBeenCalled()
  })

  test("evicts and rethrows when the evaluation rejects", async () => {
    const onRejected = vi.fn()
    const error = new Error("failed")

    await expect(evictOnRejection(Promise.reject(error), onRejected)).rejects.toBe(error)
    expect(onRejected).toHaveBeenCalledTimes(1)
  })
})
