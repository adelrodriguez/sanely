import { setTimeout as sleep } from "node:timers/promises"
import { describe, expect, test, vi } from "vitest"
import type { Decision } from "#lib/definition/decision.ts"
import type { Hook } from "#lib/evaluation/hooks.ts"
import { flag } from "#lib/definition/index.ts"
import {
  EvaluationAbortedError,
  EvaluationTimeoutError,
  IdentityNotFoundError,
  InvalidDecisionError,
  ProviderFailedError,
} from "#lib/errors/index.ts"
import { type Decide, evaluate, type Evaluator, timeoutOf } from "#lib/evaluation/engine.ts"
import { identifyAs, identifyWith, type Identity } from "#lib/identity/index.ts"
import { type DecisionStore, createSharing } from "#lib/sharing/index.ts"

const identity: Identity = { distinctId: "user123" }
const betaAccess = flag.boolean("beta-access", false)
const theme = flag.variant("theme", ["light", "dark"], "light", {
  payload: (payload) => ({ accent: String(payload) }),
})

function createEvaluator(overrides: Partial<Evaluator<Identity>> = {}): Evaluator<Identity> {
  return {
    hooks: [],
    onError: undefined,
    provider: { decideOne: () => Promise.resolve(null), name: "test" },
    sharing: createSharing({ coalesce: false }, detached.changes, detached.onError),
    timeoutMs: undefined,
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

describe("timeoutOf", () => {
  test("prefers the flag timeout over the reader timeout", () => {
    const evaluator = createEvaluator({ timeoutMs: 100 })

    expect(timeoutOf(evaluator, betaAccess)).toBe(100)
    expect(timeoutOf(evaluator, flag.boolean("fast", false, { timeoutMs: 5 }))).toBe(5)
  })
})

describe("evaluate", () => {
  test("returns a provider decision", async () => {
    const decide = decideWith({ type: "boolean", value: true })

    const details = await evaluate(createEvaluator(), betaAccess, identify, decide, noDeadline)

    expect(details).toEqual({ flagKey: "beta-access", source: "provider", value: true })
    expect(decide).toHaveBeenCalledWith(betaAccess, identity, { signal: expect.any(AbortSignal) })
  })

  test("returns a variant with its parsed payload", async () => {
    const details = await evaluate(
      createEvaluator(),
      theme,
      identify,
      decideWith({ payload: "red", type: "variant", variant: "dark" }),
      noDeadline
    )

    expect(details).toEqual({
      flagKey: "theme",
      payload: { accent: "red" },
      source: "provider",
      value: "dark",
    })
  })

  test("returns a stored decision without asking the provider", async () => {
    const stored: Decision = { type: "boolean", value: true }
    const store: DecisionStore = {
      get: () => Promise.resolve(stored),
      set: () => Promise.resolve(),
    }
    const decide = decideWith(null)
    const evaluator = createEvaluator({
      sharing: createSharing({ store }, detached.changes, detached.onError),
    })

    const details = await evaluate(evaluator, betaAccess, identify, decide, noDeadline)

    expect(details.source).toBe("cache")
    expect(decide).not.toHaveBeenCalled()
  })

  test("falls back with IdentityNotFoundError when the identity is missing", async () => {
    const details = await evaluate(
      createEvaluator(),
      betaAccess,
      identifyWith<Identity>(() => null),
      decideWith(null),
      noDeadline
    )

    expect(details).toMatchObject({ source: "default", value: false })
    expect(details.error).toBeInstanceOf(IdentityNotFoundError)
  })

  test("falls back with InvalidDecisionError for a decision that does not fit", async () => {
    const details = await evaluate(
      createEvaluator(),
      theme,
      identify,
      decideWith({ type: "variant", variant: "purple" }),
      noDeadline
    )

    expect(details).toMatchObject({ source: "default", value: "light" })
    expect(details.error).toBeInstanceOf(InvalidDecisionError)
  })

  test("keeps a provider failure", async () => {
    const failure = new ProviderFailedError({ cause: new Error("down"), provider: "test" })

    const details = await evaluate(
      createEvaluator(),
      betaAccess,
      identify,
      () => Promise.reject(failure),
      noDeadline
    )

    expect(details.error).toBe(failure)
  })

  test("wraps an unexpected failure as ProviderFailedError", async () => {
    const details = await evaluate(
      createEvaluator(),
      betaAccess,
      identify,
      () => Promise.reject(new Error("unexpected")),
      noDeadline
    )

    expect(details.error).toBeInstanceOf(ProviderFailedError)
    expect(details.error).toMatchObject({ provider: "test" })
  })

  test("falls back with EvaluationTimeoutError after the timeout", async () => {
    const details = await evaluate(
      createEvaluator({ timeoutMs: 5 }),
      betaAccess,
      identify,
      neverSettles,
      noDeadline
    )

    expect(details.error).toBeInstanceOf(EvaluationTimeoutError)
    expect(details.error).toMatchObject({ timeoutMs: 5 })
  })

  test("falls back with EvaluationAbortedError when the caller aborts", async () => {
    const controller = new AbortController()
    const reason = new Error("stop")
    const pending = evaluate(createEvaluator(), betaAccess, identify, neverSettles, {
      signal: controller.signal,
    })
    controller.abort(reason)

    const details = await pending

    expect(details.error).toBeInstanceOf(EvaluationAbortedError)
    expect(details.error?.cause).toBe(reason)
  })

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

  test("adds no timeout of its own when the deadline is a signal", async () => {
    const decide = vi.fn(async () => {
      await sleep(15)
      return { type: "boolean", value: true }
    })

    const details = await evaluate(
      createEvaluator({ timeoutMs: 1 }),
      betaAccess,
      identify,
      decide,
      { deadline: new AbortController().signal }
    )

    expect(details.source).toBe("provider")
  })

  test("returns a deadline signal's timeout error", async () => {
    const deadline = new AbortController()
    deadline.abort(new EvaluationTimeoutError(3))

    const details = await evaluate(createEvaluator(), betaAccess, identify, decideWith(null), {
      deadline: deadline.signal,
    })

    expect(details.error).toBe(deadline.signal.reason)
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
      createEvaluator({ hooks: [{ error }], timeoutMs: 5 }),
      betaAccess,
      identify,
      neverSettles,
      noDeadline
    )
    await sleep(0)

    expect(details.error).toBeInstanceOf(EvaluationTimeoutError)
    expect(error).toHaveBeenCalledTimes(1)
  })

  test("stops waiting for slow error hooks at the deadline", async () => {
    const error = vi.fn(neverSettles)

    const details = await evaluate(
      createEvaluator({ hooks: [{ error }], timeoutMs: 20 }),
      betaAccess,
      identify,
      () => Promise.reject(new Error("down")),
      noDeadline
    )

    expect(details.error).toBeInstanceOf(ProviderFailedError)
    expect(error).toHaveBeenCalledTimes(1)
  })

  test("reports a failing hook through onError", async () => {
    const onError = vi.fn()

    await evaluate(
      createEvaluator({
        hooks: [
          {
            before: () => {
              throw new Error("hook failed")
            },
          },
        ],
        onError,
      }),
      betaAccess,
      identify,
      decideWith({ type: "boolean", value: true }),
      noDeadline
    )
    await sleep(0)

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ _tag: "HookFailed", hookIndex: 0, phase: "before" })
    )
  })
})
