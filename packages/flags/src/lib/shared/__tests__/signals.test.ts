import { describe, expect, test, vi } from "vitest"
import { createEvaluationSignal, createSharedSignal } from "#lib/shared/signals.ts"

describe("createEvaluationSignal", () => {
  test("forwards an already-aborted caller signal when a timeout is configured", () => {
    const caller = new AbortController()
    const reason = new Error("caller stopped")
    caller.abort(reason)

    const evaluation = createEvaluationSignal(caller.signal, 100)

    expect(evaluation.signal.aborted).toBe(true)
    expect(evaluation.signal.reason).toBe(reason)
    evaluation.cleanup()
  })

  test("removes the caller abort listener during cleanup", () => {
    const caller = new AbortController()
    const removeEventListener = vi.spyOn(caller.signal, "removeEventListener")
    const evaluation = createEvaluationSignal(caller.signal, 100)

    evaluation.cleanup()
    caller.abort(new Error("too late"))

    expect(removeEventListener).toHaveBeenCalledTimes(1)
    expect(removeEventListener).toHaveBeenCalledWith("abort", expect.any(Function))
    expect(evaluation.signal.aborted).toBe(false)
  })
})

describe("createSharedSignal", () => {
  test("aborts with the last reason once every joined signal has aborted", () => {
    const shared = createSharedSignal()
    const first = new AbortController()
    const second = new AbortController()
    const reason = new Error("second stopped")
    shared.join(first.signal)
    shared.join(second.signal)

    first.abort(new Error("first stopped"))
    expect(shared.signal.aborted).toBe(false)
    second.abort(reason)

    expect(shared.signal.aborted).toBe(true)
    expect(shared.signal.reason).toBe(reason)
  })

  test("ignores an aborted joiner while another joiner waits", () => {
    const shared = createSharedSignal()
    const waiting = new AbortController()
    shared.join(waiting.signal)

    shared.join(AbortSignal.abort(new Error("already stopped")))

    expect(shared.signal.aborted).toBe(false)
  })

  test("aborts when the only joiner has already aborted", () => {
    const shared = createSharedSignal()
    const reason = new Error("already stopped")

    shared.join(AbortSignal.abort(reason))

    expect(shared.signal.aborted).toBe(true)
    expect(shared.signal.reason).toBe(reason)
    shared.join(new AbortController().signal)
    expect(shared.signal.reason).toBe(reason)
  })

  test("stops listening after release", () => {
    const shared = createSharedSignal()
    const caller = new AbortController()
    shared.join(caller.signal)

    shared.release()
    caller.abort(new Error("too late"))

    expect(shared.signal.aborted).toBe(false)
  })
})
