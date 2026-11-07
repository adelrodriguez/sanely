import { describe, expect, it } from "vitest"
import { StoreError } from "#lib/limiter/errors.ts"
import { headers } from "#lib/limiter/headers.ts"

const counts = { limit: 30, remaining: 12, reset: 0, retryAfter: 1_799_001, window: 3_600_000 }

describe("headers", () => {
  it("describes the policy and the remaining units of an allowed request", () => {
    expect(
      headers({
        ...counts,
        mode: "enforce",
        name: "suggestions:ip",
        reason: "store",
        success: true,
      })
    ).toEqual({
      RateLimit: '"suggestions:ip";r=12;t=1800',
      "RateLimit-Policy": '"suggestions:ip";q=30;w=3600',
    })
  })

  it("adds Retry-After to a denial", () => {
    expect(
      headers({ ...counts, name: "x", reason: "cache", remaining: 0, success: false })
    ).toMatchObject({
      "Retry-After": "1800",
    })
  })

  it("escapes quotes and backslashes in the name", () => {
    expect(
      headers({ ...counts, mode: "enforce", name: 'a"b\\c', reason: "store", success: true })
        .RateLimit
    ).toBe(String.raw`"a\"b\\c";r=12;t=1800`)
  })

  it("produces no headers for a store error", () => {
    expect(
      headers({
        error: new StoreError(new Error("down")),
        name: "x",
        reason: "storeError",
        success: false,
      })
    ).toEqual({})
  })

  it("produces no headers for a dry-run limiter, before and after it would deny", () => {
    expect(
      headers({ ...counts, mode: "dryRun", name: "x", reason: "store", success: true })
    ).toEqual({})
    expect(
      headers({
        ...counts,
        mode: "dryRun",
        name: "x",
        reason: "dryRun",
        remaining: 0,
        success: true,
      })
    ).toEqual({})
  })
})
