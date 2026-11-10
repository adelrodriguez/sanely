import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { Fault } from "#lib/fault.ts"
import { Tagged } from "#lib/tagged.ts"

describe("Tagged", () => {
  it("creates class with matching _tag and name", () => {
    class NotFoundError extends Tagged("NotFoundError")<{ resource: string }>() {}

    const fault = new NotFoundError({ resource: "user" })

    expect(fault).toBeInstanceOf(Fault)
    expect(fault._tag).toBe("NotFoundError")
    expect(fault.name).toBe("NotFoundError")
  })

  it("keeps constructor fields in fields, not on the instance", () => {
    class NotFoundError extends Tagged("NotFoundError")<{ id: string; resource: string }>() {}

    const fault = new NotFoundError({ id: "123", resource: "user" })

    expect(fault.fields).toEqual({ id: "123", resource: "user" })
    expect(Object.hasOwn(fault, "id")).toBe(false)
  })

  it("gives a fault without fields an empty fields object", () => {
    class TimeoutError extends Tagged("TimeoutError")() {}

    expect(new TimeoutError().fields).toEqual({})
  })

  it("accepts any field name, including Fault methods and envelope keys", () => {
    class ProbeError extends Tagged("ProbeError")<Record<string, string>>() {}

    const keyArb = fc.oneof(
      fc.string({ maxLength: 30, minLength: 1 }),
      fc.constantFrom(
        "message",
        "_tag",
        "cause",
        "fields",
        "toString",
        "valueOf",
        "constructor",
        "unwrap",
        "withMeta",
        "flatten"
      )
    )

    fc.assert(
      fc.property(keyArb, (key) => {
        const fault = new ProbeError({ [key]: "value" })

        expect(fault.fields[key]).toBe("value")
        expect(fault._tag).toBe("ProbeError")
        expect(typeof fault.withMeta).toBe("function")
      })
    )
  })

  it("keeps a __proto__ field as an own data key without changing any prototype", () => {
    class ProbeError extends Tagged("ProbeError")<Record<string, string>>() {}
    const fields = JSON.parse('{"__proto__": "value"}') as Record<string, string>

    const fault = new ProbeError(fields)

    expect(Object.getOwnPropertyDescriptor(fault.fields, "__proto__")?.value).toBe("value")
    expect(Object.getPrototypeOf(fault.fields)).toBe(Object.prototype)
    expect(Object.getPrototypeOf(fault)).toBe(ProbeError.prototype)
  })
})
