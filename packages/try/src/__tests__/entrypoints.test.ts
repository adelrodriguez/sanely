import { runInNewContext } from "node:vm"
import { describe, expect, it } from "vitest"
import {
  CancellationError,
  isCancellationError,
  isPanic,
  isRetryExhaustedError,
  isTimeoutError,
  isUnhandledException,
  Panic,
  RetryExhaustedError,
  TimeoutError,
  UnhandledException,
} from "#errors.ts"
import * as errors$ from "#errors.ts"
import * as try$ from "#index.ts"
import * as types$ from "#types.ts"
import { expectPanic } from "./test-utils"

function createForeignError(name: string, extras: Record<string, unknown> = {}): Error {
  const foreign = runInNewContext("new Error('foreign')") as Error
  foreign.name = name
  Object.assign(foreign, extras)
  return foreign
}

describe("entrypoints", () => {
  it("exposes only the execution API from the root entrypoint", () => {
    expect(Object.keys(try$).toSorted()).toEqual([
      "all",
      "allSettled",
      "disposer",
      "flow",
      "gen",
      "retry",
      "retryOptions",
      "run",
      "runSync",
      "signal",
      "timeout",
      "wrap",
    ])
  })

  it("exposes only errors and type guards from the errors entrypoint", () => {
    expect(Object.keys(errors$).toSorted()).toEqual([
      "CancellationError",
      "Panic",
      "RetryExhaustedError",
      "TimeoutError",
      "UnhandledException",
      "isCancellationError",
      "isPanic",
      "isRetryExhaustedError",
      "isTimeoutError",
      "isUnhandledException",
    ])
  })

  it("exposes no runtime values from the types entrypoint", () => {
    expect(Object.keys(types$)).toEqual([])
  })

  it("constructs errors from the errors entrypoint with stable names and messages", () => {
    const panic = new Panic("FLOW_NO_EXIT")

    expect(panic).toBeInstanceOf(Error)

    expect(panic.name).toBe("Panic")
    expect(panic.message).toBe("flow() requires at least one task to call $exit().")
    expect(panic.code).toBe("FLOW_NO_EXIT")
    expect(new CancellationError().name).toBe("CancellationError")
    expect(new CancellationError().message).toBe("Execution was cancelled")
    expect(new RetryExhaustedError().name).toBe("RetryExhaustedError")
    expect(new RetryExhaustedError().message).toBe("Retry attempts exhausted")
    expect(new TimeoutError().name).toBe("TimeoutError")
    expect(new TimeoutError().message).toBe("Execution timed out")
    expect(new UnhandledException().name).toBe("UnhandledException")
    expect(new UnhandledException().message).toBe("Unhandled exception")
  })

  it("exposes retryOptions from the root entrypoint", () => {
    expect(try$.retryOptions(2)).toEqual({
      backoff: "constant",
      delay: 0,
      limit: 2,
    })
  })

  it("throws Panic when retryOptions() receives an unknown backoff from untyped code", () => {
    try {
      try$.retryOptions({ backoff: "bogus", limit: 2 } as never)
      expect.unreachable("should have thrown")
    } catch (error) {
      expectPanic(error, "UNREACHABLE_RETRY_POLICY_BACKOFF")
    }
  })

  it("throws Panic when timeout() receives Infinity", () => {
    try {
      try$.timeout(Infinity)
      expect.unreachable("should have thrown")
    } catch (error) {
      expectPanic(error, "TIMEOUT_INVALID_MS")
    }
  })

  // A string from config reaches the API without the compile-time check.
  it.each(["soon", "-1s", "1M", "Infinity"])(
    "throws Panic when an entry point receives the time expression %j",
    (value) => {
      const fromConfig = value as never
      const delayPolicy = { backoff: "constant", delay: fromConfig, limit: 2 } as const
      const capPolicy = { backoff: "exponential", limit: 2, maxDelay: fromConfig } as const

      expect(() => try$.timeout(fromConfig)).toThrow(
        expect.objectContaining({ code: "TIMEOUT_INVALID_MS", name: "Panic" })
      )
      expect(() => try$.retry(3).timeout(fromConfig)).toThrow(
        expect.objectContaining({ code: "TIMEOUT_INVALID_MS", name: "Panic" })
      )
      expect(() => try$.signal(new AbortController().signal).timeout(fromConfig)).toThrow(
        expect.objectContaining({ code: "TIMEOUT_INVALID_MS", name: "Panic" })
      )
      for (const policy of [delayPolicy, capPolicy]) {
        expect(() => try$.retry(policy)).toThrow(
          expect.objectContaining({ code: "RETRY_INVALID_DELAY", name: "Panic" })
        )
        expect(() => try$.timeout(100).retry(policy)).toThrow(
          expect.objectContaining({ code: "RETRY_INVALID_DELAY", name: "Panic" })
        )
        expect(() => try$.retryOptions(policy)).toThrow(
          expect.objectContaining({ code: "RETRY_INVALID_DELAY", name: "Panic" })
        )
      }
    }
  )

  it("reads time expressions the same way from every entry point", async () => {
    expect(
      try$.retryOptions({ backoff: "exponential", delay: "200ms", limit: 4, maxDelay: "2s" })
    ).toEqual(try$.retryOptions({ backoff: "exponential", delay: 200, limit: 4, maxDelay: 2000 }))

    const timedOut = await try$.timeout("0ms").run(() => "late")
    expect(timedOut).toBeInstanceOf(TimeoutError)
    expect((timedOut as TimeoutError).message).toBe("Execution exceeded timeout of 0ms")

    const chained = await try$
      .retry(2)
      .timeout("5s")
      .run(() => "done")
    expect(chained).toBe("done")
  })

  it("throws Panic when timeout() receives a negative number", () => {
    try {
      try$.timeout(-1)
      expect.unreachable("should have thrown")
    } catch (error) {
      expectPanic(error, "TIMEOUT_INVALID_MS")
    }
  })

  it("throws Panic when retry() receives zero", () => {
    try {
      try$.retry(0 as number)
      expect.unreachable("should have thrown")
    } catch (error) {
      expectPanic(error, "RETRY_INVALID_LIMIT")
    }
  })

  it("throws Panic when retry() receives a fractional limit", () => {
    try {
      try$.retry(2.5 as number)
      expect.unreachable("should have thrown")
    } catch (error) {
      expectPanic(error, "RETRY_INVALID_LIMIT")
    }
  })

  describe("error type guards", () => {
    it("matches genuine instances", () => {
      expect(isCancellationError(new CancellationError())).toBe(true)
      expect(isTimeoutError(new TimeoutError())).toBe(true)
      expect(isRetryExhaustedError(new RetryExhaustedError())).toBe(true)
      expect(isUnhandledException(new UnhandledException())).toBe(true)
      expect(isPanic(new Panic("FLOW_NO_EXIT"))).toBe(true)
    })

    it("matches foreign errors by name when instanceof fails", () => {
      const foreignCancellation = createForeignError("CancellationError")

      expect(foreignCancellation).not.toBeInstanceOf(CancellationError)
      expect(foreignCancellation).not.toBeInstanceOf(Error)
      expect(isCancellationError(foreignCancellation)).toBe(true)

      expect(isTimeoutError(createForeignError("TimeoutError"))).toBe(true)
      expect(isRetryExhaustedError(createForeignError("RetryExhaustedError"))).toBe(true)
      expect(isUnhandledException(createForeignError("UnhandledException"))).toBe(true)
      expect(isPanic(createForeignError("Panic", { code: "FLOW_NO_EXIT" }))).toBe(true)
    })

    it("requires a string code for foreign Panic errors", () => {
      expect(isPanic(createForeignError("Panic"))).toBe(false)
      expect(isPanic(createForeignError("Panic", { code: 42 }))).toBe(false)
    })

    it("matches the same errors on a runtime without Error.isError, such as Node.js 22", () => {
      const isError = Reflect.get(Error, "isError") as unknown
      Reflect.deleteProperty(Error, "isError")

      try {
        expect(isTimeoutError(new TimeoutError())).toBe(true)
        expect(isTimeoutError(createForeignError("TimeoutError"))).toBe(true)
        expect(isPanic(createForeignError("Panic", { code: "FLOW_NO_EXIT" }))).toBe(true)
        expect(isTimeoutError({ name: "TimeoutError", [Symbol.toStringTag]: "Error" })).toBe(false)
        expect(isTimeoutError({ name: "TimeoutError" })).toBe(false)
        expect(isTimeoutError(null)).toBe(false)
      } finally {
        Reflect.defineProperty(Error, "isError", {
          configurable: true,
          value: isError,
          writable: true,
        })
      }
    })

    it("rejects non-errors and unrelated names", () => {
      const spoofedError = { name: "TimeoutError", [Symbol.toStringTag]: "Error" }

      expect(Object.prototype.toString.call(spoofedError)).toBe("[object Error]")
      expect(isTimeoutError(spoofedError)).toBe(false)
      expect(isPanic({ code: "FLOW_NO_EXIT", name: "Panic", [Symbol.toStringTag]: "Error" })).toBe(
        false
      )
      expect(isCancellationError(null)).toBe(false)
      expect(isTimeoutError(0)).toBe(false)
      expect(isRetryExhaustedError("RetryExhaustedError")).toBe(false)
      expect(isUnhandledException({ name: "UnhandledException" })).toBe(false)
      expect(isPanic(new Error("Panic"))).toBe(false)
      expect(isCancellationError(new TimeoutError())).toBe(false)
    })
  })
})
