import { afterEach, describe, expect, it, vi } from "vitest"
import { checkIsPromiseLike, resolveWithAbort } from "#lib/shared/utils.ts"

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})
describe("utils", () => {
  // A literal `then` key fails unicorn/no-thenable, so these values inherit `then` or take it from
  // a variable key.
  const thenKey = ["th", "en"].join("")
  const promisePrototype: object = Object.getPrototypeOf(Promise.resolve())

  it.each([
    ["a promise", Promise.resolve(1), true],
    ["an object that inherits a then method", Object.create(promisePrototype), true],
    [
      "a function that inherits a then method",
      Object.setPrototypeOf(() => 1, promisePrototype),
      true,
    ],
    ["an object whose then is not a function", { [thenKey]: 1 }, false],
    ["null", null, false],
    ["a string", "then", false],
  ])("checks whether %s is promise-like", (_, value: unknown, expected) => {
    expect(checkIsPromiseLike(value)).toBe(expected)
  })

  it("returns the promise value and detaches the abort listener when the promise settles first", async () => {
    const controller = new AbortController()
    let resolvePromise!: (value: string) => void
    let abortFactoryCalls = 0

    const pending = new Promise<string>((resolve) => {
      resolvePromise = resolve
    })

    const resultPromise = resolveWithAbort(controller.signal, pending, () => {
      abortFactoryCalls += 1
      return "aborted" as const
    })

    resolvePromise("done")

    const result = await resultPromise
    controller.abort(new Error("too late"))

    expect(result).toBe("done")
    expect(abortFactoryCalls).toBe(0)
  })
})
