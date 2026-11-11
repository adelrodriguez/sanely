import fc from "fast-check"
import { describe, expect, it } from "vitest"

import type { SerializableValue } from "#lib/wire.ts"
import { Fault, findCause, isFault } from "#lib/fault.ts"
import { Tagged } from "#lib/tagged.ts"

class ExampleFault extends Fault {
  constructor(message?: string) {
    super("ExampleFault")
    if (message !== undefined) this.message = message
  }
}

describe("Fault", () => {
  it("defaults message to tag", () => {
    const fault = new ExampleFault()
    expect(fault.message).toBe("ExampleFault")
    expect(fault.name).toBe("ExampleFault")
    expect(fault._tag).toBe("ExampleFault")
  })

  it("appends an indented caused-by stack", () => {
    const cause = new Error("root")
    cause.stack = "RootError: root\nline-1\nline-2"

    const fault = new ExampleFault()
    const originalStack = fault.stack
    fault.withCause(cause)

    expect(fault.stack).toBe(`${originalStack}\nCaused by: RootError: root\n  line-1\n  line-2`)
  })

  it("rebuilds stack when withCause is called multiple times", () => {
    const first = new Error("first")
    first.stack = "Error: first\nfirst-line"
    const second = new Error("second")
    second.stack = "Error: second\nsecond-line"

    const fault = new ExampleFault()
    const originalStack = fault.stack

    fault.withCause(first)
    expect(fault.stack).toBe(`${originalStack}\nCaused by: Error: first\n  first-line`)

    fault.withCause(second)
    expect(fault.stack).toBe(`${originalStack}\nCaused by: Error: second\n  second-line`)
  })

  it("restores original stack when cause has no stack", () => {
    const cause = new Error("root")
    cause.stack = "Error: root\nroot-line"

    const fault = new ExampleFault()
    const originalStack = fault.stack

    fault.withCause(cause)
    expect(fault.stack).not.toBe(originalStack)

    fault.withCause("not an error")
    expect(fault.stack).toBe(originalStack)
  })

  it("rebuilds the cause block when cause is assigned directly", () => {
    const first = new Error("first")
    first.stack = "Error: first\nfirst-line"
    const second = new Error("second")
    second.stack = "Error: second\nsecond-line"

    const fault = new ExampleFault()
    const originalStack = fault.stack

    fault.cause = first
    expect(fault.stack).toBe(`${originalStack}\nCaused by: Error: first\n  first-line`)

    fault.cause = second
    expect(fault.stack).toBe(`${originalStack}\nCaused by: Error: second\n  second-line`)

    fault.cause = "not an error"
    expect(fault.stack).toBe(originalStack)
  })

  it("writes the message from withMessage into a stack that already has a cause", () => {
    const cause = new Error("root")
    cause.stack = "Error: root\nroot-line"

    const fault = new ExampleFault().withCause(cause)
    const frames = fault.stack?.split("\n").slice(1)
    fault.withMessage("new message")

    expect(fault.stack?.split("\n")).toStrictEqual(["ExampleFault: new message", ...(frames ?? [])])
  })

  it("writes the message from withMessage into a stack that was already read", () => {
    const fault = new ExampleFault()
    const frames = fault.stack?.split("\n").slice(1)
    fault.withMessage("new message")

    expect(fault.stack?.split("\n")).toStrictEqual(["ExampleFault: new message", ...(frames ?? [])])
  })

  it("writes a directly assigned message into the stack when the cause changes", () => {
    const fault = new ExampleFault().withCause("not an error")
    const frames = fault.stack?.split("\n").slice(1)
    fault.message = "new message"
    fault.cause = "another value"

    expect(fault.stack?.split("\n")).toStrictEqual(["ExampleFault: new message", ...(frames ?? [])])
  })

  it("returns full unwrap chain from latest fault to root cause", () => {
    class DatabaseError extends Tagged("DatabaseError")() {}
    class ServiceError extends Tagged("ServiceError")() {}
    class ApiError extends Tagged("ApiError")() {}

    const root = new Error("root")
    const db = new DatabaseError().withCause(root)
    const svc = new ServiceError().withCause(db)
    const api = new ApiError().withCause(svc)

    const chain = api.unwrap()

    expect(chain).toEqual([api, svc, db, root])
  })

  it("stops unwrap traversal when cause depth exceeds max", () => {
    const head = new ExampleFault("head")
    let current: ExampleFault = head

    for (let index = 0; index < 150; index += 1) {
      const next = new ExampleFault(`node-${index}`)
      current.withCause(next)
      current = next
    }

    const chain = head.unwrap()

    expect(chain.length).toBe(101)
    expect(chain[0]).toBe(head)
    expect((chain.at(-1) as ExampleFault).message).toBe("node-99")
  })

  it("stops unwrap traversal for circular cause chains", () => {
    const fault = new ExampleFault().withMessage("loop")
    fault.withCause(fault)

    const chain = fault.unwrap()

    expect(chain.length).toBe(101)
    expect(chain.every((item) => item === fault)).toBe(true)
  })

  it("avoids stack overflow when serializing circular cause chains", () => {
    const fault = new ExampleFault().withMessage("loop")
    fault.withCause(fault)

    const serialized = fault.toSerializable()

    expect(serialized.__fault).toBe(true)

    let current = serialized
    let depth = 0

    while (current.cause?.kind === "fault") {
      depth += 1
      current = current.cause.value
      expect(current.message).toBe("loop")
    }

    expect(depth).toBe(100)
    expect(current.cause).toBeUndefined()
  })

  it("merges full context in head-to-leaf order with head precedence", () => {
    class DatabaseError extends Tagged("DatabaseError")() {}
    class ServiceError extends Tagged("ServiceError")() {}
    class ApiError extends Tagged("ApiError")() {}

    const db = new DatabaseError().withMeta({ db: true, shared: "db" })
    const svc = new ServiceError().withMeta({ service: true, shared: "service" }).withCause(db)
    const api = new ApiError().withMeta({ api: true, shared: "api" }).withCause(svc)

    expect(api.getContext()).toEqual({
      api: true,
      db: true,
      service: true,
      shared: "api",
    })
  })

  it("sets the description and keeps the message", () => {
    const fault = new ExampleFault().withMessage("User not found")

    fault.withDescription("Lookup returned 0 rows")

    expect(fault.message).toBe("User not found")
    expect(fault.description).toBe("Lookup returned 0 rows")
  })

  it("replaces an earlier description", () => {
    const fault = new ExampleFault().withDescription("old description")

    fault.withDescription("new description")

    expect(fault.description).toBe("new description")
  })

  it("accumulates meta across multiple withMeta calls", () => {
    const fault = new ExampleFault()
      .withMeta({ requestId: "req-1" })
      .withMeta({ traceId: "trace-1" })
      .withMeta({ requestId: "req-2" })

    expect(fault.meta).toEqual({
      requestId: "req-2",
      traceId: "trace-1",
    })
  })

  it("returns tags from fault nodes in chain order", () => {
    class DatabaseError extends Tagged("DatabaseError")() {}
    class ServiceError extends Tagged("ServiceError")() {}

    const leaf = new DatabaseError().withCause("raw")
    const head = new ServiceError().withCause(leaf)

    expect(head.getTags()).toEqual(["ServiceError", "DatabaseError"])
  })

  it("skips empty values in message flatten path", () => {
    class DatabaseError extends Tagged("DatabaseError")() {}
    class ServiceError extends Tagged("ServiceError")() {}

    const leaf = new DatabaseError().withMessage("db")
    const head = new ServiceError().withMessage("svc").withCause(leaf)

    const flattened = head.flatten({
      formatter(value) {
        return value === "db" ? "" : value
      },
    })

    expect(flattened).toBe("svc")
  })

  it("flattens descriptions when field is description", () => {
    class DatabaseError extends Tagged("DatabaseError")() {}
    class ServiceError extends Tagged("ServiceError")() {}

    const leaf = new DatabaseError().withDescription("db description")
    const head = new ServiceError().withDescription("service description").withCause(leaf)

    expect(head.flatten({ field: "description" })).toBe("service description -> db description")
  })

  it("skips faults without a description when flattening descriptions", () => {
    class DatabaseError extends Tagged("DatabaseError")() {}
    class ServiceError extends Tagged("ServiceError")() {}

    const leaf = new DatabaseError().withDescription("db description")
    const head = new ServiceError().withCause(leaf)

    expect(head.flatten({ field: "description" })).toBe("db description")
  })

  it("flattens safely when cause contains a circular object", () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular

    const fault = new ExampleFault().withMessage("top").withCause(circular)

    expect(fault.flatten()).toBe("top -> [object Object]")
  })

  it("flattens any chain to the exact join of trimmed, consecutively-deduped messages", () => {
    const separator = " | "
    // Random strings almost never repeat or trim to empty, so mix in a small
    // pool that reliably exercises the dedupe and empty-skip branches.
    const messageArb = fc.oneof(
      fc.string({ maxLength: 10 }),
      fc.constantFrom("same", " same ", "other", "", "   ")
    )

    fc.assert(
      fc.property(fc.array(messageArb, { maxLength: 8, minLength: 1 }), (messages) => {
        class LayerError extends Tagged("LayerError")() {}

        let fault: Fault | undefined
        for (const message of messages) {
          const layer = new LayerError().withMessage(message)
          if (fault !== undefined) layer.withCause(fault)
          fault = layer
        }
        if (fault === undefined) throw new Error("unreachable: minLength is 1")

        // flatten() walks head to leaf (the reverse of construction order),
        // trims each message, drops empties, and dedupes consecutive repeats.
        const expected: string[] = []
        for (const message of messages.toReversed().map((value) => value.trim())) {
          if (message !== "" && message !== expected.at(-1)) expected.push(message)
        }

        expect(fault.flatten({ separator })).toBe(expected.join(separator))
      })
    )
  })

  it("serializes through toJSON when stringified", () => {
    const fault = new ExampleFault()
      .withMessage("message")
      .withDescription("description")
      .withMeta({ key: "value" })

    const json = JSON.stringify(fault)
    const parsed = JSON.parse(json) as unknown

    expect(parsed).toEqual({
      __fault: true,
      _tag: "ExampleFault",
      description: "description",
      message: "message",
      meta: { key: "value" },
      name: "ExampleFault",
      stack: fault.stack,
    })
  })
})

describe("findCause", () => {
  it("finds the first chain node that is an instance of the given class", () => {
    class DatabaseError extends Tagged("DatabaseError")<{ table: string }>() {}
    class ServiceError extends Tagged("ServiceError")() {}

    const leaf = new DatabaseError({ table: "users" })
    const mid = new Error("mid", { cause: leaf })
    const head = new ServiceError().withCause(mid)

    expect(findCause(head, DatabaseError)).toBe(leaf)
    expect(findCause(head, ServiceError)).toBe(head)
    expect(findCause(head, Error)).toBe(head)
    expect(findCause(head, TypeError)).toBeUndefined()
  })

  it("finds causes by constructor identity, not by tag", () => {
    class DatabaseError extends Tagged("DatabaseError")() {}
    class ForeignDatabaseError extends Tagged("DatabaseError")() {}

    const head = new ExampleFault().withCause(new ForeignDatabaseError())

    expect(findCause(head, DatabaseError)).toBeUndefined()
  })

  it("returns undefined for values that are not faults", () => {
    const leaf = new ExampleFault()

    expect(findCause(new Error("plain", { cause: leaf }), ExampleFault)).toBeUndefined()
    expect(findCause("ExampleFault", ExampleFault)).toBeUndefined()
  })
})

describe("isFault", () => {
  it("returns true for Fault instances", () => {
    expect(isFault(new ExampleFault())).toBe(true)
  })

  it("returns false for non-Fault values", () => {
    expect(isFault(new Error("plain"))).toBe(false)
    expect(isFault("error")).toBe(false)
    expect(isFault(null)).toBe(false)
  })
})

class FieldsFault extends Fault {
  constructor(fields: Record<string, SerializableValue>) {
    super("FieldsFault", fields)
  }
}

// The names of the wire envelope. Fields never appear at this level.
const ENVELOPE_KEYS = new Set([
  "__fault",
  "_tag",
  "cause",
  "description",
  "fields",
  "message",
  "meta",
  "name",
  "stack",
])

// Random strings almost never hit a name that matters, so mix in Fault methods,
// envelope keys, and Object.prototype names.
const fieldKeyArb = fc.oneof(
  fc.string({ maxLength: 30, minLength: 1 }),
  fc.constantFrom(
    "toString",
    "valueOf",
    "constructor",
    "hasOwnProperty",
    "__proto__",
    "unwrap",
    "withMeta",
    "flatten",
    "toJSON",
    "toSerializable",
    "message",
    "_tag",
    "fields"
  )
)

// defineProperty, so a "__proto__" key becomes an own data property.
function fieldsWith(key: string, value: SerializableValue): Record<string, SerializableValue> {
  const fields: Record<string, SerializableValue> = {}
  Object.defineProperty(fields, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  })
  return fields
}

describe("Fault fields", () => {
  it("keeps any field name as an own key of fields and serializes it under fields", () => {
    fc.assert(
      fc.property(fieldKeyArb, fc.jsonValue({ maxDepth: 2 }), (key, value) => {
        const fault = new FieldsFault(fieldsWith(key, value))

        expect(Object.hasOwn(fault.fields, key)).toBe(true)
        expect(fault.fields[key]).toEqual(value)
        expect(Object.getPrototypeOf(fault.fields)).toBe(Object.prototype)
        expect(typeof fault.unwrap).toBe("function")

        const serialized = fault.toSerializable()
        expect(Object.hasOwn(serialized.fields ?? {}, key)).toBe(true)
        expect(serialized.fields?.[key]).toEqual(value)
        expect(Object.keys(serialized).every((name) => ENVELOPE_KEYS.has(name))).toBe(true)
      })
    )
  })

  it("copies the fields object it receives", () => {
    const fields: Record<string, SerializableValue> = { id: "1" }
    const fault = new FieldsFault(fields)
    fields.id = "2"

    expect(fault.fields.id).toBe("1")
  })

  it("omits fields from the wire when a fault has none", () => {
    expect(Object.hasOwn(new ExampleFault().toSerializable(), "fields")).toBe(false)
  })

  it("never serializes own properties outside fields", () => {
    // oxlint-disable-next-line typescript/unbound-method -- always invoked with an explicit receiver via .call below.
    const toSerializable = Fault.prototype.toSerializable
    // `fields` itself is the one name a subclass must not redeclare.
    const ownKeyArb = fieldKeyArb.filter((key) => key !== "fields")

    fc.assert(
      fc.property(ownKeyArb, fc.jsonValue({ maxDepth: 2 }), (key, value) => {
        const fault = new ExampleFault()
        Object.defineProperty(fault, key, {
          configurable: true,
          enumerable: true,
          value,
          writable: true,
        })

        // Call via the prototype: the generated key may shadow instance methods.
        const serialized = toSerializable.call(fault)

        expect(Object.keys(serialized).every((name) => ENVELOPE_KEYS.has(name))).toBe(true)
        expect(serialized.fields).toBeUndefined()
      })
    )
  })
})
