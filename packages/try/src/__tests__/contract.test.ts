import { describe, expect, it } from "vitest"
import { CancellationError, Panic, TimeoutError } from "#errors.ts"
import * as try$ from "#index.ts"
import { expectPanic, expectUnhandled } from "./test-utils"

/**
 * The contract every terminal call follows: it resolves with a result union and throws only a
 * Panic. A failure from the work goes to `catch` or becomes an UnhandledException. Only the call's
 * own deadline and signal produce a TimeoutError or CancellationError.
 *
 * Each API runs the same work: `work` receives the call's signal and returns the work's value.
 */
type Work = (signal: AbortSignal | undefined) => unknown
type CatchFn = (error: unknown) => unknown
type Builder = Pick<ReturnType<typeof try$.timeout>, "all" | "allSettled" | "flow" | "run">

interface Api {
  name: string
  call(builder: Builder, work: Work, catchFn?: CatchFn): Promise<unknown>
  /**
   * What the call resolves with when the work returns `value`.
   */
  success(value: unknown): unknown
  /**
   * Whether a failure from the work is a value of the call, as in allSettled().
   */
  keepsFailures: boolean
}

const apis: Api[] = [
  {
    call: (builder, work, catchFn) =>
      catchFn
        ? builder.run({ catch: catchFn, try: (ctx) => work(ctx.signal) })
        : builder.run((ctx) => work(ctx.signal)),
    keepsFailures: false,
    name: "run",
    success: (value) => value,
  },
  {
    call: (builder, work, catchFn) =>
      catchFn
        ? builder.all(
            {
              a() {
                return work(this.$signal)
              },
            },
            { catch: catchFn }
          )
        : builder.all({
            a() {
              return work(this.$signal)
            },
          }),
    keepsFailures: false,
    name: "all",
    success: (value) => ({ a: value }),
  },
  {
    call: (builder, work) =>
      builder.allSettled({
        a() {
          return work(this.$signal)
        },
      }),
    keepsFailures: true,
    name: "allSettled",
    success: (value) => ({ a: { status: "fulfilled", value } }),
  },
  {
    call: (builder, work, catchFn) =>
      catchFn
        ? builder.flow(
            {
              async a() {
                return this.$exit(await work(this.$signal))
              },
            },
            { catch: catchFn }
          )
        : builder.flow({
            async a() {
              return this.$exit(await work(this.$signal))
            },
          }),
    keepsFailures: false,
    name: "flow",
    success: (value) => value,
  },
]

const mappingApis = apis.filter((api) => api.name !== "allSettled")

function waitForAbort(signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    signal?.addEventListener(
      "abort",
      () => {
        resolve()
      },
      { once: true }
    )
  })
}

function fail(error: unknown): Work {
  return () => {
    throw error
  }
}

describe.each(apis)("$name follows the terminal call contract", (api) => {
  it("resolves with the value of the work", async () => {
    expect(await api.call(try$, () => 1)).toEqual(api.success(1))
  })

  it("resolves with a failure of the work instead of rejecting", async () => {
    const failure = new Error("boom")
    const result = await api.call(try$, fail(failure))

    if (api.keepsFailures) {
      expect(result).toEqual({ a: { reason: failure, status: "rejected" } })
    } else {
      expectUnhandled(result, failure)
    }
  })

  it("treats a TimeoutError from a nested call as a failure of the work", async () => {
    const nested = new TimeoutError("nested deadline")
    const result = await api.call(try$, fail(nested))

    if (api.keepsFailures) {
      expect(result).toEqual({ a: { reason: nested, status: "rejected" } })
    } else {
      expectUnhandled(result, nested)
    }
  })

  it("resolves with TimeoutError when its own deadline fires", async () => {
    const result = await api.call(try$.timeout(1), async (signal) => {
      await waitForAbort(signal)
      return "late"
    })

    expect(result).toBeInstanceOf(TimeoutError)
  })

  it("resolves with CancellationError when its own signal aborts", async () => {
    const reason = new Error("stop")
    const result = await api.call(try$.signal(AbortSignal.abort(reason)), () => 1)

    expect(result).toBeInstanceOf(CancellationError)
    expect((result as CancellationError).cause).toBe(reason)
  })

  it("throws a Panic from the work", async () => {
    const result = await api
      .call(try$, () => {
        // A task that reads an unknown result is programmer misuse.
        throw new Panic("TASK_UNKNOWN_REFERENCE")
      })
      .catch((error: unknown) => error)

    expectPanic(result, "TASK_UNKNOWN_REFERENCE")
  })

  it("throws WRAP_THROW when a wrap throws", async () => {
    const failure = new Error("wrap failed")
    const result = await api
      .call(
        try$.wrap(() => {
          throw failure
        }),
        () => 1
      )
      .catch((error: unknown) => error)

    expectPanic(result, "WRAP_THROW")
    expect((result as Error).cause).toBe(failure)
  })
})

describe.each(mappingApis)("$name maps failures with catch", (api) => {
  it("passes the raw failure to catch and resolves with its value", async () => {
    const caught: unknown[] = []
    const result = await api.call(try$, fail(null), (error) => {
      caught.push(error)
      return "mapped"
    })

    expect(result).toBe("mapped")
    expect(caught).toEqual([null])
  })

  it("does not pass its own deadline to catch", async () => {
    const caught: unknown[] = []
    const result = await api.call(
      try$.timeout(1),
      async (signal) => {
        await waitForAbort(signal)
        throw signal?.reason
      },
      (error) => {
        caught.push(error)
        return "mapped"
      }
    )

    expect(result).toBeInstanceOf(TimeoutError)
    expect(caught).toEqual([])
  })

  it("throws CATCH_HANDLER_THROW when catch throws", async () => {
    const failure = new Error("catch failed")
    const result = await api
      .call(try$, fail(new Error("boom")), () => {
        throw failure
      })
      .catch((error: unknown) => error)

    expectPanic(result, "CATCH_HANDLER_THROW")
    expect((result as Error).cause).toBe(failure)
  })
})

describe("runSync follows the terminal call contract", () => {
  it("returns a failure of the work instead of throwing", () => {
    const failure = new Error("boom")

    expectUnhandled(
      try$.runSync(() => {
        throw failure
      }),
      failure
    )
  })

  it("throws WRAP_THROW when a wrap throws", () => {
    const failure = new Error("wrap failed")

    try {
      try$
        .wrap(() => {
          throw failure
        })
        .runSync(() => 1)
      expect.unreachable("should have thrown")
    } catch (error) {
      expectPanic(error, "WRAP_THROW")
    }
  })

  it("throws CATCH_HANDLER_THROW when catch throws", () => {
    try {
      try$.runSync({
        catch: () => {
          throw new Error("catch failed")
        },
        try: () => {
          throw new Error("boom")
        },
      })
      expect.unreachable("should have thrown")
    } catch (error) {
      expectPanic(error, "CATCH_HANDLER_THROW")
    }
  })
})

describe("nested terminal calls", () => {
  it("returns an orchestration failure to the outer run() as a value, not a throw", async () => {
    let attempts = 0
    const failure = new Error("boom")

    const result = await try$.retry(3).run(async () => {
      attempts += 1
      return await try$.all({
        a() {
          throw failure
        },
      })
    })

    // The outer run() sees a value, so it does not retry. Throw the error to retry it.
    expect(attempts).toBe(1)
    expectUnhandled(result, failure)
  })
})
