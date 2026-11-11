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
        delayMs: 5,
        limit: 4,
        maxDelayMs: 12,
      })
    ).toEqual({
      backoff: "exponential",
      delayMs: 5,
      jitter: undefined,
      limit: 4,
      maxDelayMs: 12,
      shouldRetry: undefined,
    })
  })

  it("defaults delayMs to 0 and omits maxDelayMs for linear retry options", () => {
    const normalized = retryOptions({ backoff: "linear", limit: 2 })

    expect(normalized).toEqual({
      backoff: "linear",
      delayMs: 0,
      jitter: undefined,
      limit: 2,
      shouldRetry: undefined,
    })
    expect("maxDelayMs" in normalized).toBe(false)
  })
})
