import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { Fault } from "#lib/fault.ts"
import { fromSerializable } from "#lib/reviver.ts"
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

describe("Tagged stack", () => {
  class UserNotFound extends Tagged("UserNotFound")<{ id: string }>() {
    constructor(fields: { id: string }) {
      super(fields)
      this.message = `User ${fields.id} not found`
    }
  }

  it("uses a message that the subclass constructor sets after super", () => {
    expect(new UserNotFound({ id: "7" }).stack?.split("\n")[0]).toBe(
      "UserNotFound: User 7 not found"
    )
  })

  it("keeps that message in the stack after withCause", () => {
    const stack = new UserNotFound({ id: "7" }).withCause(new Error("db down")).stack ?? ""

    expect(stack.split("\n")[0]).toBe("UserNotFound: User 7 not found")
    expect(stack).toContain("Caused by: Error: db down")
  })
})

describe("revived fault stack", () => {
  class LookupError extends Tagged("LookupError")() {}

  function revivedWithCause(): Fault {
    const sent = new LookupError().withCause(new Error("first cause"))
    return fromSerializable(sent.toSerializable())
  }

  it("replaces a serialized cause block when withCause sets a new cause", () => {
    const stack = revivedWithCause().withCause(new Error("second cause")).stack ?? ""

    expect(stack).not.toContain("first cause")
    expect(stack.match(/Caused by: /g)).toHaveLength(1)
    expect(stack).toContain("Caused by: Error: second cause")
  })

  it("drops a serialized cause block when the new cause is not an Error", () => {
    const stack = revivedWithCause().withCause("a thrown string").stack ?? ""

    expect(stack).not.toContain("Caused by: ")
    expect(stack.split("\n")[0]).toBe("LookupError: LookupError")
  })
})

describe("stack with a multiline message", () => {
  class LookupError extends Tagged("LookupError")() {
    constructor() {
      super()
      this.message = "Lookup failed\nCaused by: stale config"
    }
  }

  it("keeps a cause marker that is part of the message", () => {
    const stack = new LookupError().withCause(new Error("db down")).stack ?? ""

    expect(stack.startsWith("LookupError: Lookup failed\nCaused by: stale config\n")).toBe(true)
    expect(stack).toMatch(/\n {4}at /)
    expect(stack).toContain("\nCaused by: Error: db down")
  })
})
