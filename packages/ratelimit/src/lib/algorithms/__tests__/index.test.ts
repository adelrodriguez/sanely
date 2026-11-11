import { describe, expect, it } from "vitest"
import { fixedWindow, slidingWindow, tokenBucket } from "#lib/algorithms/index.ts"
import { InvalidOptionError } from "#lib/options/index.ts"

// The longest period every store can expire state for. See `MAX_PERIOD` in `src/lib/algorithms/index.ts`.
const longest = 2 ** 50

describe("algorithms", () => {
  it.each([fixedWindow, slidingWindow])("accepts a window of up to 2^50 ms for %o", (window) => {
    expect(window({ limit: 1, window: longest }).window).toBe(longest)
    expect(() => window({ limit: 1, window: longest + 1 })).toThrow(InvalidOptionError)
  })

  it("accepts a token bucket that refills completely in up to 2^50 ms", () => {
    expect(() => tokenBucket({ capacity: 4, interval: longest / 4, refillRate: 1 })).not.toThrow()
    expect(() => tokenBucket({ capacity: 5, interval: longest / 4, refillRate: 1 })).toThrow(
      InvalidOptionError
    )
  })

  it("reads a window, an interval, or a timeout given as a time expression", () => {
    expect(fixedWindow({ limit: 1, window: "1m" }).window).toBe(60_000)
    expect(slidingWindow({ limit: 1, window: "1h" }).window).toBe(3_600_000)
    expect(tokenBucket({ capacity: 1, interval: "1.5s", refillRate: 1 }).interval).toBe(1500)
  })

  it.each(["0ms", "0.5ms", "-1s"])(
    "rejects %o, which is not a whole positive millisecond count",
    (window) => {
      const error = catchError(() => fixedWindow({ limit: 1, window: window as "1m" }))

      expect(error).toBeInstanceOf(InvalidOptionError)
      expect(error).toMatchObject({ option: "window", value: window })
    }
  )

  it("rejects a string that is not a time expression", () => {
    const error = catchError(() => fixedWindow({ limit: 1, window: "soon" as "1m" }))

    expect(error).toBeInstanceOf(InvalidOptionError)
    expect(error).toMatchObject({ option: "window", value: "soon" })
  })

  it("reports the time expression it was given when the period is too long", () => {
    expect(() => fixedWindow({ limit: 1, window: "50000y" })).toThrow(
      expect.objectContaining({ option: "window", value: "50000y" })
    )
  })
})

function catchError(run: () => unknown) {
  try {
    run()
  } catch (error) {
    return error
  }

  throw new Error("Expected the call to throw")
}
