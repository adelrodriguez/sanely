import { setTimeout as sleep } from "node:timers/promises"
import { describe, expect, test, vi } from "vitest"
import type { Evaluator } from "#lib/evaluation/engine.ts"
import { decision } from "#lib/definition/decision.ts"
import { type Flag, flag } from "#lib/definition/index.ts"
import {
  EvaluationTimeoutError,
  InvalidDecisionError,
  ProviderFailedError,
} from "#lib/errors/index.ts"
import { evaluateMany } from "#lib/evaluation/batch.ts"
import { identifyAs, identifyWith, type Identity } from "#lib/identity/index.ts"
import { defineProvider, providerCalls, type ProviderDefinition } from "#lib/provider/index.ts"
import { createSharing } from "#lib/sharing/index.ts"

const betaAccess = flag.boolean("beta-access", false)
const theme = flag.variant("theme", ["light", "dark"], "light")
const user: Identity = { distinctId: "user-1" }
// A batch without a caller signal, and a reader without provider changes or an error callback.
const caller = { signal: undefined }
const detached = { changes: undefined, onError: undefined }

function createEvaluator(
  definition: ProviderDefinition,
  overrides: Partial<Evaluator<Identity>> = {}
): Evaluator<Identity> {
  return {
    hooks: [],
    onError: undefined,
    provider: providerCalls(defineProvider(definition)),
    sharing: createSharing({ coalesce: false }, detached.changes, detached.onError),
    timeoutMs: undefined,
    ...overrides,
  }
}

function bulkDecide(flags: readonly Flag[]) {
  return Object.fromEntries(
    flags.map((item) => [
      item.key,
      item.kind === "boolean" ? decision.boolean(true) : decision.variant("dark"),
    ])
  )
}

describe("evaluateMany", () => {
  test("returns no results for no flags", async () => {
    const decide = vi.fn(bulkDecide)

    await expect(
      evaluateMany(createEvaluator({ decide, name: "bulk" }), [], identifyAs(user), caller.signal)
    ).resolves.toEqual([])
    expect(decide).not.toHaveBeenCalled()
  })

  test("sends each key once to a bulk provider and keeps the order", async () => {
    const decide = vi.fn(bulkDecide)
    const identify = vi.fn(() => user)
    const otherBeta = flag.boolean("beta-access", true)

    const results = await evaluateMany(
      createEvaluator({ decide, name: "bulk" }),
      [betaAccess, theme, otherBeta],
      identifyWith(identify),
      caller.signal
    )

    expect(results.map((result) => result.value)).toEqual([true, "dark", true])
    expect(decide).toHaveBeenCalledTimes(1)
    expect(decide.mock.calls[0]?.[0]).toEqual([betaAccess, theme])
    expect(identify).toHaveBeenCalledTimes(1)
  })

  test("calls decideOne once for each key", async () => {
    const decideOne = vi.fn((item: Flag) =>
      item.kind === "boolean" ? decision.boolean(true) : decision.variant("dark")
    )

    const results = await evaluateMany(
      createEvaluator({ decideOne, name: "one" }),
      [betaAccess, theme, betaAccess],
      identifyAs(user),
      caller.signal
    )

    expect(results.map((result) => result.value)).toEqual([true, "dark", true])
    expect(decideOne).toHaveBeenCalledTimes(2)
  })

  test("fails only the flag whose decideOne fails", async () => {
    const results = await evaluateMany(
      createEvaluator({
        decideOne: (item) => {
          if (item.kind === "variant") throw new Error("down")
          return decision.boolean(true)
        },
        name: "one",
      }),
      [betaAccess, theme],
      identifyAs(user),
      caller.signal
    )

    expect(results[0]).toMatchObject({ source: "provider", value: true })
    expect(results[1].error).toBeInstanceOf(ProviderFailedError)
  })

  test("fails a flag that a bulk provider leaves out", async () => {
    const results = await evaluateMany(
      createEvaluator({ decide: () => ({ "beta-access": decision.boolean(true) }), name: "bulk" }),
      [betaAccess, theme],
      identifyAs(user),
      caller.signal
    )

    expect(results[0].value).toBe(true)
    expect(results[1].error).toBeInstanceOf(InvalidDecisionError)
  })

  test("fails every flag when the bulk provider fails", async () => {
    const results = await evaluateMany(
      createEvaluator({ decide: () => Promise.reject(new Error("down")), name: "bulk" }),
      [betaAccess, theme],
      identifyAs(user),
      caller.signal
    )

    expect(results.map((result) => result.error?._tag)).toEqual([
      "ProviderFailedError",
      "ProviderFailedError",
    ])
  })

  test("gives every flag the identity error without calling the provider", async () => {
    const decide = vi.fn(bulkDecide)

    const results = await evaluateMany(
      createEvaluator({ decide, name: "bulk" }),
      [betaAccess, theme],
      identifyWith<Identity>(() => null),
      caller.signal
    )

    expect(results.map((result) => result.error?._tag)).toEqual([
      "IdentityNotFoundError",
      "IdentityNotFoundError",
    ])
    expect(decide).not.toHaveBeenCalled()
  })

  test("times out each flag with its own deadline", async () => {
    const fast = flag.boolean("fast", false, { timeoutMs: 5 })
    const decideOne = vi.fn(async (item: Flag) => {
      await sleep(item.key === "fast" ? 30 : 0)
      return decision.boolean(true)
    })

    const results = await evaluateMany(
      createEvaluator({ decideOne, name: "one" }, { timeoutMs: 100 }),
      [fast, betaAccess],
      identifyAs(user),
      caller.signal
    )

    expect(results[0].error).toBeInstanceOf(EvaluationTimeoutError)
    expect(results[1]).toMatchObject({ source: "provider", value: true })
  })

  test("opens a new round after every evaluation left an aborted round", async () => {
    const controller = new AbortController()
    const decide = vi.fn(bulkDecide)
    const evaluator = createEvaluator({ decide, name: "bulk" })
    const first = evaluateMany(evaluator, [betaAccess], identifyAs(user), controller.signal)
    await sleep(0)
    controller.abort(new Error("stop"))

    const [aborted] = await first
    const [again] = await evaluateMany(evaluator, [betaAccess], identifyAs(user), caller.signal)
    expect(aborted.error?._tag).toBe("EvaluationAbortedError")
    expect(again.value).toBe(true)
  })

  test("joins a round that is already open", async () => {
    const decide = vi.fn(bulkDecide)
    const evaluator = createEvaluator({ decide, name: "bulk" })

    const results = await Promise.all([
      evaluateMany(evaluator, [betaAccess], identifyAs(user), caller.signal),
      evaluateMany(evaluator, [theme], identifyAs(user), caller.signal),
    ])

    expect(results.flat().map((result) => result.value)).toEqual([true, "dark"])
  })
})
