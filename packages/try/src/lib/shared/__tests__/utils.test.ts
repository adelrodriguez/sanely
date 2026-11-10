import { afterEach, describe, expect, it, vi } from "vitest"
import { resolveWithAbort } from "#lib/shared/utils.ts"

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})
describe("utils", () => {
  it("returns the promise value and detaches the abort listener when the promise settles first", async () => {
    const controller = new AbortController()
    let resolvePromise!: (value: string) => void
    let abortFactoryCalls = 0

    const pending = new Promise<string>((resolve) => {
      resolvePromise = resolve
    })

    const resultPromise = resolveWithAbort(controller.signal, pending, () => {
      abortFactoryCalls += 1
      return "aborted" as const
    })

    resolvePromise("done")

    const result = await resultPromise
    controller.abort(new Error("too late"))

    expect(result).toBe("done")
    expect(abortFactoryCalls).toBe(0)
  })
})
