import { afterEach, describe, expect, test, vi } from "vitest"
import { isDevelopmentEnvironment, normalizeError } from "#lib/shared/utils.ts"

describe("normalizeError", () => {
  test("returns an Error unchanged", () => {
    const error = new Error("failed")

    expect(normalizeError(error)).toBe(error)
  })

  test("serializes a thrown non-Error object", () => {
    expect(normalizeError({ code: "unavailable" }).message).toBe('{"code":"unavailable"}')
  })

  test("uses the object fallback when serialization fails", () => {
    const circular: { self?: unknown } = {}
    circular.self = circular

    expect(normalizeError(circular).message).toBe("Non-Error object thrown")
  })

  test("uses a stable message for a thrown function", () => {
    expect(normalizeError(() => null).message).toBe("Non-Error function thrown")
  })

  test("stringifies a primitive", () => {
    expect(normalizeError("text").message).toBe("text")
  })

  test("stays total for a value that throws when inspected", () => {
    const revocable = Proxy.revocable({}, {})
    revocable.revoke()

    expect(normalizeError(revocable.proxy).message).toBe("Uninspectable value thrown")
  })
})

describe("isDevelopmentEnvironment", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test("is false only in production", () => {
    vi.stubEnv("NODE_ENV", "production")
    expect(isDevelopmentEnvironment()).toBe(false)
    vi.stubEnv("NODE_ENV", "test")
    expect(isDevelopmentEnvironment()).toBe(true)
  })
})
