import { describe, expect, test } from "vitest"
import {
  decision,
  extractDecisionValue,
  parsePayload,
  validateDecision,
} from "#lib/definition/decision.ts"
import { type Flag, flag } from "#lib/definition/index.ts"
import { InvalidDecisionError } from "#lib/errors/index.ts"

const betaAccess = flag.boolean("beta-access", false)
const theme = flag.variant("theme", ["light", "dark"], "light")
const parsedTheme = flag.variant("parsed-theme", ["light", "dark"], "light", {
  payload: (payload) => {
    if (typeof payload !== "string") throw new TypeError("not a string")
    return payload.toUpperCase()
  },
})

function reasonOf(value: unknown, target: Flag): string | undefined {
  try {
    validateDecision(value, target)
  } catch (error) {
    if (error instanceof InvalidDecisionError) return error.reason
    throw error
  }
  return undefined
}

describe("decision", () => {
  test("builds boolean and variant decisions", () => {
    expect(decision.boolean(true)).toEqual({ type: "boolean", value: true })
    expect(decision.variant("dark")).toEqual({ type: "variant", variant: "dark" })
    expect(decision.variant("dark", { id: 1 })).toEqual({
      payload: { id: 1 },
      type: "variant",
      variant: "dark",
    })
  })
})

describe("extractDecisionValue", () => {
  test("reads the boolean value or the variant", () => {
    expect(extractDecisionValue(decision.boolean(true))).toBe(true)
    expect(extractDecisionValue(decision.variant("dark"))).toBe("dark")
  })
})

describe("validateDecision", () => {
  test("accepts decisions that fit the flag", () => {
    expect(() => {
      validateDecision(decision.boolean(true), betaAccess)
    }).not.toThrow()
    expect(() => {
      validateDecision(decision.variant("dark"), theme)
    }).not.toThrow()
  })

  test("rejects malformed decisions", () => {
    expect(reasonOf(null, betaAccess)).toBe("expected an object")
    expect(reasonOf("true", betaAccess)).toBe("expected an object")
    expect(reasonOf({ value: true }, betaAccess)).toBe('type must be "boolean" or "variant"')
    expect(reasonOf({ type: "boolean", value: "true" }, betaAccess)).toBe(
      "a boolean decision needs a boolean value"
    )
    expect(reasonOf({ type: "variant", variant: 1 }, theme)).toBe(
      "a variant decision needs a string variant"
    )
  })

  test("rejects a decision of the other kind", () => {
    expect(reasonOf(decision.variant("dark"), betaAccess)).toBe(
      "expected a boolean decision but received a variant decision"
    )
    expect(reasonOf(decision.boolean(true), theme)).toBe(
      "expected a variant decision but received a boolean decision"
    )
  })

  test("rejects a variant that the flag does not allow", () => {
    expect(reasonOf(decision.variant("purple"), theme)).toBe(
      'the flag does not allow the variant "purple"'
    )
  })

  test("keeps the rejected decision", () => {
    const rejected = { type: "variant", variant: "purple" }
    try {
      validateDecision(rejected, theme)
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidDecisionError)
      expect((error as InvalidDecisionError).decision).toBe(rejected)
    }
  })
})

describe("parsePayload", () => {
  test("returns undefined without a payload or for a boolean decision", () => {
    expect(parsePayload(theme, decision.variant("dark"))).toBeUndefined()
    expect(parsePayload(betaAccess, decision.boolean(true))).toBeUndefined()
  })

  test("returns the raw payload when the flag has no parser", () => {
    expect(parsePayload(theme, decision.variant("dark", { id: 1 }))).toEqual({ id: 1 })
  })

  test("returns the parsed payload", () => {
    expect(parsePayload(parsedTheme, decision.variant("dark", "accent"))).toBe("ACCENT")
  })

  test("turns a parser failure into an invalid decision", () => {
    const rejected = decision.variant("dark", 42)
    try {
      parsePayload(parsedTheme, rejected)
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidDecisionError)
      expect(error).toMatchObject({
        decision: rejected,
        reason: "the payload parser rejected the payload",
      })
      expect((error as Error).cause).toBeInstanceOf(TypeError)
    }
  })
})
