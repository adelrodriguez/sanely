import { describe, expect, test } from "vitest"
import { IdentityNotFoundError } from "#lib/errors/index.ts"
import { anonymous, distinctIdOf, identifyAs, identifyWith } from "#lib/identity/index.ts"

describe("identifyWith", () => {
  test("resolves the identity that identify returns", async () => {
    await expect(identifyWith(() => ({ distinctId: 1 }))()).resolves.toEqual({ distinctId: 1 })
    await expect(identifyWith(() => Promise.resolve<typeof anonymous>(anonymous))()).resolves.toBe(
      anonymous
    )
  })

  test("rejects a missing identity", async () => {
    await expect(identifyWith(() => null)()).rejects.toBeInstanceOf(IdentityNotFoundError)
  })

  test("keeps a throwing identify as the cause", async () => {
    const cause = new Error("no session")

    await expect(
      identifyWith(() => {
        throw cause
      })()
    ).rejects.toMatchObject({ _tag: "IdentityNotFoundError", cause })
  })
})

describe("identifyAs", () => {
  test("resolves the given identity and rejects a missing one", async () => {
    await expect(identifyAs({ distinctId: "u" })()).resolves.toEqual({ distinctId: "u" })
    await expect(identifyAs(null)()).rejects.toBeInstanceOf(IdentityNotFoundError)
  })
})

describe("distinctIdOf", () => {
  test("reads the distinctId, or null for anonymous", () => {
    expect(distinctIdOf({ distinctId: 7 })).toBe(7)
    expect(distinctIdOf(anonymous)).toBeNull()
  })
})
