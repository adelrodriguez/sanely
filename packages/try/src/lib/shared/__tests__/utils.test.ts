import { afterEach, describe, expect, it, vi } from "vitest"
import { Panic } from "#lib/shared/errors.ts"
import { assertUnreachable, resolveWithAbort } from "#lib/shared/utils.ts"

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})
describe("utils", () => {
  it("throws Panic from assertUnreachable", () => {
    let thrown: unknown

    try {
      assertUnreachable("unexpected" as never, "UNREACHABLE_RETRY_POLICY_BACKOFF")
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(Panic)
    expect((thrown as Panic).code).toBe("UNREACHABLE_RETRY_POLICY_BACKOFF")
    expect((thrown as Panic).message).toContain("Unreachable case: unexpected")
  })

  it("returns the abort result and observes the input rejection when the signal is already aborted", async () => {
    const controller = new AbortController()
    controller.abort(new Error("stop"))
    const unhandledRejections: unknown[] = []
    const onUnhandledRejection = (reason: unknown) => {
      unhandledRejections.push(reason)
    }
    let abortFactoryCalls = 0

    process.on("unhandledRejection", onUnhandledRejection)

    try {
      const rejected = Promise.reject(new Error("later"))
      const result = await resolveWithAbort(controller.signal, rejected, () => {
        abortFactoryCalls += 1
        return "aborted" as const
      })

      await new Promise((resolve) => {
        setTimeout(resolve, 0)
      })

      expect(result).toBe("aborted")
      expect(abortFactoryCalls).toBe(1)
      expect(unhandledRejections).toHaveLength(0)
    } finally {
      process.off("unhandledRejection", onUnhandledRejection)
    }
  })

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
