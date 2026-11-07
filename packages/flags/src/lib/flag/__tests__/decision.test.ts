import { describe, expect, test } from "vitest"
import type { Decision } from "#lib/types/index.ts"
import { extractDecisionValue, validateDecision } from "#lib/flag/decision.ts"
import { MalformedDecisionError } from "#lib/shared/errors.ts"

describe("extractDecisionValue", () => {
  test("extracts boolean value from boolean decision", () => {
    const decision: Decision = { type: "boolean", value: true }

    const result = extractDecisionValue(decision)

    expect(result).toBe(true)
  })

  test("extracts variant from variant decision", () => {
    const decision: Decision = { type: "variant", variant: "dark" }

    const result = extractDecisionValue(decision)

    expect(result).toBe("dark")
  })

  test("extracts values without validation", () => {
    const booleanDecision: Decision = { type: "boolean", value: true }
    const variantDecision: Decision = { type: "variant", variant: "system" }

    expect(extractDecisionValue(booleanDecision)).toBe(true)
    expect(extractDecisionValue(variantDecision)).toBe("system")
  })
})

describe("validateDecision", () => {
  test("accepts a boolean decision for a boolean flag", () => {
    expect(() => {
      validateDecision(
        { type: "boolean", value: true },
        { defaultValue: false, key: "beta-access" }
      )
    }).not.toThrow()
  })

  test("accepts an allowed variant for a variant flag", () => {
    expect(() => {
      validateDecision(
        { type: "variant", variant: "dark" },
        { defaultValue: "light", key: "theme", variants: ["light", "dark"] }
      )
    }).not.toThrow()
  })

  test("rejects a variant decision for a boolean flag", () => {
    expect(() => {
      validateDecision(
        { type: "variant", variant: "dark" },
        { defaultValue: false, key: "beta-access" }
      )
    }).toThrow('Type mismatch: expected boolean decision but received variant "dark"')
  })

  test("rejects a boolean decision for a variant flag", () => {
    expect(() => {
      validateDecision(
        { type: "boolean", value: true },
        { defaultValue: "light", key: "theme", variants: ["light", "dark"] }
      )
    }).toThrow('Type mismatch: expected variant decision but received boolean "true"')
  })

  test("rejects a variant outside the allowed list", () => {
    expect(() => {
      validateDecision(
        { type: "variant", variant: "purple" },
        { defaultValue: "light", key: "theme", variants: ["light", "dark"] }
      )
    }).toThrow("Invalid variant: purple")
  })

  test("rejects decisions without a valid type discriminant", () => {
    expect(() => {
      validateDecision(
        { value: true },
        {
          defaultValue: false,
          key: "beta-access",
        }
      )
    }).toThrow(MalformedDecisionError)
    expect(() => {
      validateDecision(
        { variant: "dark" },
        {
          defaultValue: "light",
          key: "theme",
          variants: ["light", "dark"],
        }
      )
    }).toThrow(MalformedDecisionError)
  })

  test("rejects decisions whose value does not match the discriminant", () => {
    expect(() => {
      validateDecision(
        { type: "boolean", value: "true" },
        {
          defaultValue: false,
          key: "beta-access",
        }
      )
    }).toThrow(MalformedDecisionError)
    expect(() => {
      validateDecision(
        { type: "variant", variant: 1 },
        {
          defaultValue: "light",
          key: "theme",
          variants: ["light", "dark"],
        }
      )
    }).toThrow(MalformedDecisionError)
  })
})
