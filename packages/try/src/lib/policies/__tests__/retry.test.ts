import { afterEach, describe, expect, it, vi } from "vitest"
import { retryOptions } from "#lib/policies/retry.ts"

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})
describe("retry helpers", () => {
  it("normalizes exponential retry options", () => {
    expect(
      retryOptions({
        backoff: "exponential",
        delay: 5,
        limit: 4,
        maxDelay: 12,
      })
    ).toEqual({
      backoff: "exponential",
      delay: 5,
      jitter: undefined,
      limit: 4,
      maxDelay: 12,
      shouldRetry: undefined,
    })
  })

  it("defaults delay to 0 and omits maxDelay for linear retry options", () => {
    const normalized = retryOptions({ backoff: "linear", limit: 2 })

    expect(normalized).toEqual({
      backoff: "linear",
      delay: 0,
      jitter: undefined,
      limit: 2,
      shouldRetry: undefined,
    })
    expect("maxDelay" in normalized).toBe(false)
  })

  it("reads time expressions into milliseconds", () => {
    expect(
      retryOptions({ backoff: "exponential", delay: "200ms", limit: 4, maxDelay: "2s" })
    ).toEqual(retryOptions({ backoff: "exponential", delay: 200, limit: 4, maxDelay: 2000 }))
    expect(retryOptions({ backoff: "linear", delay: "1.5s", limit: 2 }).delay).toBe(1500)
  })

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])("rejects a delay of %s", (delay) => {
    expect(() => retryOptions({ backoff: "constant", delay, limit: 2 })).toThrow(
      expect.objectContaining({ code: "RETRY_INVALID_DELAY", name: "Panic" })
    )
  })

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])("rejects a maxDelay of %s", (maxDelay) => {
    expect(() => retryOptions({ backoff: "exponential", limit: 2, maxDelay })).toThrow(
      expect.objectContaining({ code: "RETRY_INVALID_DELAY", name: "Panic" })
    )
  })

  // A string from config reaches the policy without the compile-time check.
  it.each(["soon", "-1s", "1M", ""])("rejects a delay expression of %j", (value) => {
    const fromConfig = value as never

    expect(() => retryOptions({ backoff: "constant", delay: fromConfig, limit: 2 })).toThrow(
      expect.objectContaining({ code: "RETRY_INVALID_DELAY", name: "Panic" })
    )
    expect(() => retryOptions({ backoff: "exponential", limit: 2, maxDelay: fromConfig })).toThrow(
      expect.objectContaining({ code: "RETRY_INVALID_DELAY", name: "Panic" })
    )
  })
})
