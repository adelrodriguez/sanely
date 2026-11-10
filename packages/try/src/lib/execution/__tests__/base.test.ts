import { describe, expect, it } from "vitest"
import type { BuilderConfig } from "#lib/policies/options.ts"
import { BaseExecution } from "#lib/execution/base.ts"

class TestExecution extends BaseExecution<number> {
  constructor(config: BuilderConfig = {}) {
    super(config)
  }

  protected override executeCore() {
    void this.config
    return 1
  }

  cancel(cause?: unknown) {
    return this.checkDidCancel(cause)
  }

  get signal() {
    return this.ctx.signal
  }

  raceCancel<V>(promise: PromiseLike<V>, cause?: unknown) {
    return this.raceWithCancellation(promise, cause)
  }

  get context() {
    return this.ctx
  }
}

describe("guard branches", () => {
  it("rejects writes, defines, and deletes through the context view", () => {
    const ctx = new TestExecution().context

    expect(Reflect.set(ctx, "signal", new AbortController().signal)).toBe(false)
    expect(Reflect.set(ctx.retry, "attempt", 99)).toBe(false)

    expect(
      Reflect.defineProperty(ctx, "signal", {
        configurable: true,
        value: new AbortController().signal,
      })
    ).toBe(false)
    expect(
      Reflect.defineProperty(ctx.retry, "attempt", {
        configurable: true,
        value: 99,
      })
    ).toBe(false)

    expect(Reflect.deleteProperty(ctx, "signal")).toBe(false)
    expect(Reflect.deleteProperty(ctx.retry, "attempt")).toBe(false)

    expect(ctx.retry).toEqual({ attempt: 1, limit: 1 })
    expect("signal" in ctx).toBe(true)
    expect(ctx.signal).toBeUndefined()
  })
})
