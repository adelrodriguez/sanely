import { setTimeout as sleep } from "node:timers/promises"
import { describe, expect, test, vi } from "vitest"
import type { Hook } from "#lib/evaluation/hooks.ts"
import { flag } from "#lib/definition/index.ts"
import { EvaluationTimeoutError, IdentityNotFoundError } from "#lib/errors/index.ts"
import { type Decide, evaluate, type Evaluator } from "#lib/evaluation/engine.ts"
import { identifyAs, identifyWith, type Identity } from "#lib/identity/index.ts"
import { createSharing } from "#lib/sharing/index.ts"

const identity: Identity = { distinctId: "user123" }
const betaAccess = flag.boolean("beta-access", false)

function createEvaluator(overrides: Partial<Evaluator<Identity>> = {}): Evaluator<Identity> {
  return {
    hooks: [],
    onError: undefined,
    provider: { decideOne: () => Promise.resolve(null), name: "test" },
    sharing: createSharing({ coalesce: false }, "test", detached.changes, detached.onError),
    timeout: undefined,
    ...overrides,
  }
}

function decideWith(decision: unknown): Decide<Identity> {
  return vi.fn(() => Promise.resolve(decision))
}

const identify = identifyAs(identity)
// A reader without provider changes or an error callback.
const detached = { changes: undefined, onError: undefined }

function neverSettles(): Promise<never> {
  return new Promise<never>(() => {
    // The provider never answers.
  })
}
const noDeadline = { signal: undefined }

describe("evaluate", () => {
  test("reports the timeout that aborted the signal when a later step throws a plain error", async () => {
    const controller = new AbortController()
    const timeout = new EvaluationTimeoutError(5)
    // Validation reads `type` after the provider answers. This getter ends the deadline with a
    // timeout and then throws an error that is not an evaluation error.
    const decision = {
      get type(): never {
        controller.abort(timeout)
        throw new Error("hostile getter")
      },
    }

    const details = await evaluate(createEvaluator(), betaAccess, identify, decideWith(decision), {
      signal: controller.signal,
    })

    expect(details.error).toBe(timeout)
  })

  test("runs before, after, and finally hooks on success", async () => {
    const calls: string[] = []
    const hook: Hook<Identity> = {
      after: (context, decision, meta) => {
        calls.push(
          `after:${meta.source}:${String(decision.type)}:${String(context.identity?.distinctId)}`
        )
      },
      before: (context) => {
        calls.push(`before:${context.flag.key}`)
      },
      error: () => {
        calls.push("error")
      },
      finally: () => {
        calls.push("finally")
      },
    }

    await evaluate(
      createEvaluator({ hooks: [hook] }),
      betaAccess,
      identify,
      decideWith({ type: "boolean", value: true }),
      noDeadline
    )
    await sleep(0)

    expect(calls).toEqual(["before:beta-access", "after:provider:boolean:user123", "finally"])
  })

  test("runs error and finally hooks with a null identity when identity fails", async () => {
    const error = vi.fn()
    const done = vi.fn()

    await evaluate(
      createEvaluator({ hooks: [{ error, finally: done }] }),
      betaAccess,
      identifyWith<Identity>(() => null),
      decideWith(null),
      noDeadline
    )
    await sleep(0)

    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ identity: null }),
      expect.any(IdentityNotFoundError)
    )
    expect(done).toHaveBeenCalledTimes(1)
  })

  test("dispatches error hooks without waiting when the deadline has passed", async () => {
    const error = vi.fn(neverSettles)

    const details = await evaluate(
      createEvaluator({ hooks: [{ error }], timeout: 5 }),
      betaAccess,
      identify,
      neverSettles,
      noDeadline
    )
    await sleep(0)

    expect(details.error).toBeInstanceOf(EvaluationTimeoutError)
    expect(error).toHaveBeenCalledTimes(1)
  })
})
