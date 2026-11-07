import { afterEach, describe, expect, it, vi } from "vitest"
import { calculateRetryDelay, retryOptions } from "#lib/policies/retry.ts"

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

  it("calculates retry delay for no-policy, constant, linear, and exponential backoff", () => {
    expect(calculateRetryDelay(1, {})).toBe(0)
    expect(
      calculateRetryDelay(3, {
        retry: { backoff: "constant", delayMs: 7, limit: 4 },
      })
    ).toBe(7)
    expect(
      calculateRetryDelay(2, {
        retry: { backoff: "linear", delayMs: 10, limit: 4 },
      })
    ).toBe(20)
    expect(
      calculateRetryDelay(3, {
        retry: { backoff: "exponential", delayMs: 5, limit: 5 },
      })
    ).toBe(20)
    expect(
      calculateRetryDelay(3, {
        retry: { backoff: "exponential", delayMs: 5, limit: 5, maxDelayMs: 12 },
      })
    ).toBe(12)
  })

  it("applies jitter only when the computed delay is positive", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5)

    expect(
      calculateRetryDelay(1, {
        retry: { backoff: "constant", delayMs: 0, jitter: true, limit: 3 },
      })
    ).toBe(0)
    expect(random).not.toHaveBeenCalled()

    expect(
      calculateRetryDelay(1, {
        retry: { backoff: "constant", delayMs: 25, jitter: true, limit: 3 },
      })
    ).toBe(12)
    expect(random).toHaveBeenCalledTimes(1)
  })
})
