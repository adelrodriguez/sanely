import { setTimeout as sleep } from "node:timers/promises"
import { describe, expect, expectTypeOf, test, vi } from "vitest"
import type { Decision } from "#lib/definition/decision.ts"
import type { EvaluationContext } from "#lib/identity/index.ts"
import { flag } from "#lib/definition/index.ts"
import { ProviderFailedError } from "#lib/errors/index.ts"
import {
  createHookRunner,
  type Hook,
  type HookFailedReport,
  type HookRunner,
} from "#lib/evaluation/hooks.ts"

const context: EvaluationContext = {
  flag: flag.boolean("test-flag", false),
  identity: { distinctId: "user123" },
  signal: new AbortController().signal,
}

// A runner without an error callback.
const detached = { onError: undefined }

const providerError = () => new ProviderFailedError({ cause: new Error("x"), provider: "test" })

const decision: Decision = { type: "boolean", value: true }

const rejectHook = () => Promise.reject(new Error("Hook error"))

describe("createHookRunner", () => {
  test("runs all before hooks and reports failures", async () => {
    const reports: HookFailedReport[] = []
    const failed = vi.fn(() => Promise.reject(new Error("Hook error")))
    const passed = vi.fn(() => Promise.resolve())
    const runner = createHookRunner([{ before: failed }, { before: passed }], context, (report) => {
      reports.push(report)
    })

    await runner.before()
    await sleep(0)

    expect(failed).toHaveBeenCalledWith(context)
    expect(passed).toHaveBeenCalledWith(context)
    expect(reports).toEqual([
      {
        _tag: "HookFailed",
        context,
        error: new Error("Hook error"),
        hookIndex: 0,
        phase: "before",
      },
    ])
  })

  test("runs all error hooks and resolves when one rejects", async () => {
    const failed = vi.fn(() => Promise.reject(new Error("Hook error")))
    const passed = vi.fn(() => Promise.resolve())
    const error = providerError()

    await createHookRunner([{ error: failed }, { error: passed }], context, detached.onError).error(
      error
    )

    expect(failed).toHaveBeenCalledWith(context, error)
    expect(passed).toHaveBeenCalledWith(context, error)
  })

  test("runs after hooks with decision source metadata, then finally hooks", async () => {
    const calls: string[] = []
    const hooks: Hook[] = [
      {
        after: (_context, received, meta) => {
          calls.push(`after:${meta.source}:${String(received === decision)}`)
        },
        finally: () => {
          calls.push("finally")
        },
      },
    ]

    createHookRunner(hooks, context, detached.onError).dispatchAfterThenFinally(decision, {
      source: "cache",
    })
    await sleep(0)

    expect(calls).toEqual(["after:cache:true", "finally"])
  })

  test("reports rejecting detached hooks with their phase and hook index", async () => {
    const reports: HookFailedReport[] = []
    const hooks: Hook[] = [{}, { after: rejectHook, error: rejectHook, finally: rejectHook }]
    const runner = createHookRunner(hooks, context, (report) => {
      reports.push(report)
    })

    runner.dispatchAfterThenFinally(decision, { source: "provider" })
    runner.dispatchError(providerError())
    runner.dispatchFinally()
    await sleep(0)

    expect(reports.map(({ hookIndex, phase }) => `${phase}:${hookIndex}`).toSorted()).toEqual([
      "after:1",
      "error:1",
      "finally:1",
      "finally:1",
    ])
  })

  test("gives no unhandled rejection when a detached hook or the reporter throws", async () => {
    const unhandled = vi.fn()
    process.on("unhandledRejection", unhandled)
    try {
      const runner = createHookRunner(
        [{ after: rejectHook, error: rejectHook, finally: rejectHook }],
        context,
        () => {
          throw new Error("Reporter error")
        }
      )

      runner.dispatchAfterThenFinally(decision, { source: "provider" })
      runner.dispatchError(providerError())
      runner.dispatchFinally()
      await sleep(10)

      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off("unhandledRejection", unhandled)
    }
  })

  test("accepts an empty hook list in every phase", async () => {
    const runner = createHookRunner([], context, detached.onError)

    await runner.before()
    await runner.error(providerError())
    runner.dispatchAfterThenFinally(decision, { source: "provider" })
    runner.dispatchError(providerError())
    runner.dispatchFinally()
  })

  test("types detached methods as void and awaitable methods as promises", () => {
    expectTypeOf<HookRunner["before"]>().returns.toEqualTypeOf<Promise<void>>()
    expectTypeOf<HookRunner["error"]>().returns.toEqualTypeOf<Promise<void>>()
    expectTypeOf<HookRunner["dispatchAfterThenFinally"]>().returns.toBeVoid()
    expectTypeOf<HookRunner["dispatchError"]>().returns.toBeVoid()
    expectTypeOf<HookRunner["dispatchFinally"]>().returns.toBeVoid()
  })
})
