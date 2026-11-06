import { describe, expect, it } from "vitest"
import { greet } from "#lib/greeting/greeting.ts"
import { InvalidNameError } from "#lib/shared/errors.ts"

describe("greet", () => {
  it("greets the trimmed name", () => {
    expect(greet("  Ada ")).toBe("Hello, Ada!")
  })

  it("throws InvalidNameError with the input for a blank name", () => {
    expect(() => greet("   ")).toThrow(new InvalidNameError("   "))
  })
})
