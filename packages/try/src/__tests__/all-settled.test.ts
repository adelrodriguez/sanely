import { describe, expect, it, vi } from "vitest"
import { CancellationError, TimeoutError } from "#errors.ts"
import * as try$ from "#index.ts"
import { expectPanic, sleep } from "./test-utils"

describe("allSettled", () => {
  it("returns empty object when task map is empty", async () => {
    const result = await try$.allSettled({})

    expect(result).toEqual({})
  })

  it.each([
    ["fulfilled", false],
    ["rejected", true],
  ])("keeps a %s task result named __proto__ as an own property", async (_status, reject) => {
    const value = new Error("task value")

    const result = await try$.allSettled({
      ["__proto__"]() {
        if (reject) {
          throw value
        }

        return value
      },
    })

    expect(Object.hasOwn(result, "__proto__")).toBe(true)
    expect(Object.getOwnPropertyDescriptor(result, "__proto__")?.value).toEqual(
      reject ? { reason: value, status: "rejected" } : { status: "fulfilled", value }
    )
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
  })

  it("returns mixed fulfilled and rejected task results", async () => {
    const boom = new Error("boom")

    const result = await try$.allSettled({
      a() {
        return 1
      },
      b() {
        throw boom
      },
    })

    expect(result).toEqual({
      a: { status: "fulfilled", value: 1 },
      b: { reason: boom, status: "rejected" },
    })
    expect((result.b as { reason: unknown }).reason).toBe(boom)
  })

  it("allows dependent tasks to handle failed dependencies", async () => {
    const failure = new Error("a failed")
    let dependencyError: unknown

    const result = await try$.allSettled({
      a() {
        throw failure
      },
      async b() {
        try {
          return await this.$result.a
        } catch (error) {
          dependencyError = error
          return "fallback"
        }
      },
    })

    expect(result).toEqual({
      a: { reason: failure, status: "rejected" },
      b: { status: "fulfilled", value: "fallback" },
    })
    expect(dependencyError).toBe(failure)
  })

  it("aborts sibling signals on a Panic and waits for siblings to settle before throwing", async () => {
    const events: string[] = []
    let siblingReason: unknown

    try {
      await try$.allSettled({
        async a() {
          await Promise.resolve()
          return await (this.$result as Record<string, Promise<unknown>>).a
        },
        async b() {
          await new Promise<void>((resolve) => {
            this.$signal.addEventListener(
              "abort",
              () => {
                resolve()
              },
              { once: true }
            )
          })
          siblingReason = this.$signal.reason
          await Promise.resolve()
          events.push("sibling:settled")
        },
      })
      expect.unreachable("should have thrown")
    } catch (error) {
      events.push("rejected")
      expectPanic(error, "TASK_SELF_REFERENCE")
      expect(siblingReason).toBe(error)
    }

    expect(events).toEqual(["sibling:settled", "rejected"])
  })

  it("throws a Panic from another copy of the package instead of recording it as a result", async () => {
    const foreignPanic = Object.assign(new Error("foreign panic"), {
      code: "TASK_SELF_REFERENCE",
      name: "Panic",
    })

    await expect(
      try$.allSettled({
        a() {
          throw foreignPanic
        },
      })
    ).rejects.toBe(foreignPanic)
  })

  it("throws a Panic from an unknown task reference", async () => {
    try {
      await try$.allSettled({
        async a() {
          return await (this.$result as Record<string, Promise<unknown>>).doesNotExist
        },
      })
      expect.unreachable("should have thrown")
    } catch (error) {
      expectPanic(error, "TASK_UNKNOWN_REFERENCE")
    }
  })

  it("throws a Panic from an invalid handler", async () => {
    try {
      await try$.allSettled({
        a: 123,
      } as unknown as {
        a(): number
      })
      expect.unreachable("should have thrown")
    } catch (error) {
      expectPanic(error, "TASK_INVALID_HANDLER")
    }
  })

  it("does not abort sibling signals when one task fails", async () => {
    let signalAbortedAfterFailure: boolean | undefined

    const result = await try$.allSettled({
      a() {
        throw new Error("a failed")
      },
      async b() {
        // Wait until the sibling failure is observable before reading the signal.
        await this.$result.a.catch(() => null)
        signalAbortedAfterFailure = this.$signal.aborted
        return "b done"
      },
    })

    expect(signalAbortedAfterFailure).toBe(false)
    expect(result.b).toEqual({ status: "fulfilled", value: "b done" })
  })

  it("applies wrap middleware around allSettled execution", async () => {
    const boom = new Error("boom")
    let wrapCalls = 0

    const result = await try$
      .wrap((ctx, next) => {
        wrapCalls += 1
        expect(ctx.retry.attempt).toBe(1)
        return next()
      })
      .allSettled({
        fail() {
          throw boom
        },
        ok() {
          return 1
        },
      })

    expect(result).toEqual({
      fail: { reason: boom, status: "rejected" },
      ok: { status: "fulfilled", value: 1 },
    })
    expect(wrapCalls).toBe(1)
  })

  it("holds cancellation until non-cooperative tasks settle", async () => {
    const controller = new AbortController()
    const reason = new Error("stop")
    let markStarted!: () => void
    let markFinished!: () => void
    let releaseTask!: () => void
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const finished = new Promise<void>((resolve) => {
      markFinished = resolve
    })
    const taskBlocker = new Promise<void>((resolve) => {
      releaseTask = resolve
    })

    const pending = try$.signal(controller.signal).allSettled({
      async blocked() {
        markStarted()

        try {
          await taskBlocker
          return 1
        } finally {
          markFinished()
        }
      },
    })

    await started
    controller.abort(reason)

    const outcome = await Promise.race([pending, sleep(0).then(() => "blocked" as const)])

    // The orchestration must stay pending while the task is still running.
    expect(outcome).toBe("blocked")

    releaseTask()
    await finished

    const error = await pending

    expect(error).toBeInstanceOf(CancellationError)
    expect((error as CancellationError).cause).toBe(reason)
  })

  it("runs disposer cleanup for both fulfilled and rejected tasks", async () => {
    const boom = new Error("boom")
    let cleanedA = false
    let cleanedB = false

    const result = await try$.allSettled({
      a() {
        this.$disposer.defer(() => {
          cleanedA = true
        })
        return 1
      },
      b() {
        this.$disposer.defer(() => {
          cleanedB = true
        })
        throw boom
      },
    })

    expect(result).toEqual({
      a: { status: "fulfilled", value: 1 },
      b: { reason: boom, status: "rejected" },
    })
    expect(cleanedA).toBe(true)
    expect(cleanedB).toBe(true)
  })

  it("waits for in-flight tasks to settle before resolving with the graph deadline", async () => {
    vi.useFakeTimers()

    try {
      let taskSettled = false
      let outcome: unknown

      const promise = try$
        .timeout(10)
        .allSettled({
          async a() {
            await sleep(40)
            taskSettled = true
            return "late" as const
          },
        })
        .then((result) => {
          outcome = result
          return result
        })

      await vi.advanceTimersByTimeAsync(10)
      expect(outcome).toBeUndefined()
      expect(taskSettled).toBe(false)

      await vi.advanceTimersByTimeAsync(30)
      await promise

      expect(taskSettled).toBe(true)
      expect(outcome).toBeInstanceOf(TimeoutError)
    } finally {
      vi.useRealTimers()
    }
  })
})
