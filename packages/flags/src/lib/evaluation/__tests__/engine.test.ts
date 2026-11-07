import { setTimeout as sleep } from "node:timers/promises"
import { describe, expect, test, vi } from "vitest"
import type {
  AnyFlagFactoryConfig,
  Decision,
  FlagCallOptions,
  FlagOptions,
  Hook,
  Identity,
} from "#lib/types/index.ts"
import { resolveConfig } from "#lib/config/resolved-config.ts"
import {
  type FlagSource,
  executeFlag as executeResolvedFlag,
  executeFlagDetails,
} from "#lib/evaluation/engine.ts"
import { FlagTimeoutError } from "#lib/shared/errors.ts"

function executeFlag<TIdentity extends Identity, T extends string[] = string[]>(
  config: AnyFlagFactoryConfig<TIdentity>,
  options: FlagOptions<T>,
  callOptions?: FlagCallOptions<TIdentity | null>
): Promise<boolean | T[number]> {
  const resolved = resolveConfig(config)
  return executeResolvedFlag(resolved, options, callOptions, resolved, {
    timeoutMs: options.timeoutMs ?? resolved.timeoutMs,
  })
}

async function expectRejection<T>(promise: Promise<T>, message: string) {
  let caughtError: Error | undefined

  try {
    await promise
  } catch (error) {
    caughtError = error instanceof Error ? error : new Error(String(error))
  }

  expect(caughtError).toBeInstanceOf(Error)
  expect(caughtError).toMatchObject({ message })
  return caughtError
}

describe("executeFlag", () => {
  test("executes boolean flag successfully", async () => {
    const identity: Identity = { distinctId: "user123" }
    const decision: Decision = { type: "boolean", value: true }

    const config = {
      decide: vi.fn(() => Promise.resolve(decision)),
      hooks: [],
      identify: vi.fn(() => Promise.resolve(identity)),
    }

    const options = {
      defaultValue: false,
      key: "test-flag",
    }

    const result = await executeFlag(config, options)

    expect(result).toBe(true)
    expect(config.identify).toHaveBeenCalled()
    expect(config.decide).toHaveBeenCalledWith("test-flag", identity, expect.any(Object))
  })

  test("executes variant flag successfully", async () => {
    const identity: Identity = { distinctId: "user123" }
    const decision: Decision = { type: "variant", variant: "dark" }

    const config = {
      decide: vi.fn(() => Promise.resolve(decision)),
      hooks: [],
      identify: vi.fn(() => Promise.resolve(identity)),
    }

    const options = {
      defaultValue: "light",
      key: "theme",
      variants: ["light", "dark", "system"],
    }

    const result = await executeFlag(config, options)

    expect(result).toBe("dark")
  })

  test("uses override identity when provided", async () => {
    const defaultIdentity: Identity = { distinctId: "default" }
    const overrideIdentity: Identity = { distinctId: "override" }
    const decision: Decision = { type: "boolean", value: true }

    const config = {
      decide: vi.fn(() => Promise.resolve(decision)),
      identify: vi.fn(() => Promise.resolve(defaultIdentity)),
    }

    const options = {
      defaultValue: false,
      key: "test-flag",
    }

    const result = await executeFlag(config, options, { identity: overrideIdentity })

    expect(result).toBe(true)
    expect(config.identify).not.toHaveBeenCalled()
    expect(config.decide).toHaveBeenCalledWith("test-flag", overrideIdentity, expect.any(Object))
  })

  test("returns default value on error", async () => {
    const config = {
      decide: vi.fn(() => Promise.resolve({ type: "boolean", value: true } as const)),
      identify: vi.fn(() => Promise.reject(new Error("Identity error"))),
    }

    const options = {
      defaultValue: false,
      key: "test-flag",
    }

    const result = await executeFlag(config, options)

    expect(result).toBe(false)
  })

  test("runs all hook lifecycle methods", async () => {
    const identity: Identity = { distinctId: "user123" }
    const decision: Decision = { type: "boolean", value: true }

    const beforeFn = vi.fn(() => Promise.resolve())
    const afterFn = vi.fn(() => Promise.resolve())
    const finallyFn = vi.fn(() => Promise.resolve())

    const hooks: Hook[] = [
      {
        after: afterFn,
        before: beforeFn,
        finally: finallyFn,
      },
    ]

    const config = {
      decide: vi.fn(() => Promise.resolve(decision)),
      hooks,
      identify: vi.fn(() => Promise.resolve(identity)),
    }

    const options = {
      defaultValue: false,
      key: "test-flag",
    }

    await executeFlag(config, options)
    await sleep(0)

    expect(beforeFn).toHaveBeenCalled()
    expect(afterFn).toHaveBeenCalled()
    expect(finallyFn).toHaveBeenCalled()
  })

  test("short-circuits when the cache returns a decision", async () => {
    const identity: Identity = { distinctId: "user123" }
    const cachedDecision: Decision = { type: "boolean", value: true }

    const config = {
      cache: {
        get: vi.fn(() => Promise.resolve(cachedDecision)),
        set: vi.fn(() => Promise.resolve()),
      },
      decide: vi.fn(() => Promise.resolve({ type: "boolean", value: false } as const)),
      identify: vi.fn(() => Promise.resolve(identity)),
    }

    const options = {
      defaultValue: false,
      key: "test-flag",
    }

    const result = await executeFlag(config, options)

    expect(result).toBe(true)
    expect(config.decide).not.toHaveBeenCalled()
  })

  test("runs error hooks when error occurs", async () => {
    const error = new Error("Decision error")

    const errorFn = vi.fn(() => Promise.resolve())
    const finallyFn = vi.fn(() => Promise.resolve())

    const hooks: Hook[] = [{ error: errorFn, finally: finallyFn }]

    const config = {
      decide: vi.fn(() => Promise.reject(error)),
      hooks,
      identify: vi.fn(() => Promise.resolve({ distinctId: "user123" })),
    }

    const options = {
      defaultValue: false,
      key: "test-flag",
    }

    const result = await executeFlag(config, options)

    expect(result).toBe(false)
    expect(errorFn).toHaveBeenCalledWith(
      {
        defaultValue: false,
        flagKey: "test-flag",
        identity: { distinctId: "user123" },
        kind: "boolean",
        signal: expect.any(AbortSignal),
        variants: undefined,
      },
      error
    )
    expect(finallyFn).toHaveBeenCalled()
  })

  test("validates variant and throws on invalid variant", async () => {
    const identity: Identity = { distinctId: "user123" }
    const decision: Decision = { type: "variant", variant: "invalid" }

    const config = {
      decide: vi.fn(() => Promise.resolve(decision)),
      identify: vi.fn(() => Promise.resolve(identity)),
    }

    const options = {
      defaultValue: "light",
      key: "theme",
      variants: ["light", "dark"],
    }

    const result = await executeFlag(config, options)

    expect(result).toBe("light") // Returns default on error
  })

  test("rejects a non-boolean default for a boolean flag at runtime", async () => {
    const config = {
      decide: () => ({ type: "boolean", value: true }) as const,
      identify: () => ({ distinctId: "user123" }),
    }
    const options = { defaultValue: "false", key: "beta-access" } as unknown as {
      defaultValue: boolean
      key: string
    }

    await expectRejection(
      executeFlag(config, options),
      "A boolean evaluation requires a boolean default value"
    )
  })

  test("rejects a non-string default for a variant flag at runtime", async () => {
    const config = {
      decide: () => ({ type: "variant", variant: "dark" }) as const,
      identify: () => ({ distinctId: "user123" }),
    }
    const options = {
      defaultValue: false,
      key: "theme",
      variants: ["light", "dark"],
    } as unknown as {
      defaultValue: string
      key: string
      variants: string[]
    }

    await expectRejection(
      executeFlag(config, options),
      "A variant evaluation requires a string default value"
    )
  })

  test("works without hooks", async () => {
    const identity: Identity = { distinctId: "user123" }
    const decision: Decision = { type: "boolean", value: true }

    const config = {
      decide: vi.fn(() => Promise.resolve(decision)),
      identify: vi.fn(() => Promise.resolve(identity)),
    }

    const options = {
      defaultValue: false,
      key: "test-flag",
    }

    const result = await executeFlag(config, options)

    expect(result).toBe(true)
  })

  test("handles null identity in hook context on error", async () => {
    const errorFn = vi.fn(() => Promise.resolve())

    const hooks: Hook[] = [{ error: errorFn }]

    const config = {
      decide: vi.fn(() => Promise.resolve({ type: "boolean", value: true } as const)),
      hooks,
      identify: vi.fn(() => Promise.reject(new Error("Identity error"))),
    }

    const options = {
      defaultValue: false,
      key: "test-flag",
    }

    await executeFlag(config, options)

    expect(errorFn).toHaveBeenCalledWith(
      {
        defaultValue: false,
        flagKey: "test-flag",
        identity: null,
        kind: "boolean",
        signal: expect.any(AbortSignal),
        variants: undefined,
      },
      expect.any(Error)
    )
  })
})

describe("executeFlagDetails with a flag source", () => {
  const identity = { distinctId: "user123" }
  const options = { defaultValue: false, key: "beta-access" }

  function createSource() {
    return {
      decide: vi.fn<FlagSource<Identity>["decide"]>(() =>
        Promise.resolve({ type: "boolean", value: true })
      ),
      resolveIdentity: vi.fn<FlagSource<Identity>["resolveIdentity"]>(() =>
        Promise.resolve(identity)
      ),
    }
  }

  test("asks the source for provider work only after a cache miss", async () => {
    const cached = new Map<string, Decision>()
    const configDecide = vi.fn(() => ({ type: "boolean", value: false }) as const)
    const config = resolveConfig<Identity>({
      cache: {
        get: (key) => Promise.resolve(cached.get(key)),
        set: (key, value) => {
          cached.set(key, value)
          return Promise.resolve()
        },
      },
      decide: configDecide,
      identify: () => null,
    })
    const source = createSource()
    const deadline = { timeoutMs: undefined }

    const first = await executeFlagDetails(config, options, undefined, source, deadline)
    await sleep(0)
    const second = await executeFlagDetails(config, options, undefined, source, deadline)

    expect(first).toMatchObject({ source: "provider", value: true })
    expect(second).toMatchObject({ source: "cache", value: true })
    expect(source.resolveIdentity).toHaveBeenCalledTimes(2)
    expect(source.decide).toHaveBeenCalledTimes(1)
    expect(source.decide).toHaveBeenCalledWith("beta-access", identity, {
      signal: expect.any(AbortSignal),
    })
    expect(configDecide).not.toHaveBeenCalled()
  })

  test("returns the timeout error when the deadline signal aborts", async () => {
    const config = resolveConfig<Identity>({
      decide: () => ({ type: "boolean", value: true }),
      identify: () => identity,
    })
    const source = createSource()
    source.decide.mockImplementation(() => Promise.withResolvers<Decision>().promise)
    const controller = new AbortController()

    const evaluation = executeFlagDetails(config, options, undefined, source, {
      signal: controller.signal,
    })
    controller.abort(new FlagTimeoutError(5))
    const details = await evaluation

    expect(details.source).toBe("default")
    expect(details.value).toBe(false)
    expect(details.error).toBeInstanceOf(FlagTimeoutError)
  })

  test("adds no timeout of its own when the deadline is a signal", async () => {
    const config = resolveConfig<Identity>({
      decide: () => ({ type: "boolean", value: true }),
      identify: () => identity,
      timeoutMs: 1,
    })
    const source = createSource()
    source.decide.mockImplementation(async () => {
      await sleep(20)
      return { type: "boolean", value: true }
    })

    const details = await executeFlagDetails(
      config,
      { ...options, timeoutMs: 1 },
      undefined,
      source,
      { signal: new AbortController().signal }
    )

    expect(details).toMatchObject({ source: "provider", value: true })
  })
})
