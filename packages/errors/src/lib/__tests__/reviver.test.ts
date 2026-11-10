import { isDeepStrictEqual } from "node:util"
import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { InvalidPayloadError } from "#lib/errors.ts"
import { Fault, toSerializable } from "#lib/fault.ts"
import { fromSerializable, isSerializableFault } from "#lib/reviver.ts"
import { MAX_CAUSE_DEPTH, type SerializableFault } from "#lib/wire.ts"

// Field names that matter elsewhere: Fault methods, envelope keys, and Object.prototype names.
const fieldKeyArb = fc.oneof(
  fc.string({ maxLength: 20, minLength: 1 }),
  fc.constantFrom(
    "toString",
    "constructor",
    "hasOwnProperty",
    "unwrap",
    "withMeta",
    "flatten",
    "message",
    "_tag",
    "fields",
    "__proto__"
  )
)

const wireFieldsArb = fc
  .array(fc.tuple(fieldKeyArb, fc.jsonValue({ maxDepth: 2 })), { maxLength: 6 })
  .map((entries) => {
    const fields: Record<string, unknown> = {}

    // defineProperty (not assignment) so a "__proto__" key lands as an own
    // data property instead of triggering the setter.
    for (const [key, value] of entries) {
      Object.defineProperty(fields, key, {
        configurable: true,
        enumerable: true,
        value,
        writable: true,
      })
    }

    return fields
  })

function buildWire(fields: Record<string, unknown>): unknown {
  return { __fault: true, _tag: "HostileError", fields, message: "hostile", name: "HostileError" }
}

// Test-side mirror of the envelope validation order, so each input has
// exactly one expected outcome.
function expectedRejection(input: unknown): string | undefined {
  if (typeof input !== "object" || input === null) return "expected __fault: true"

  const record = input as Record<string, unknown>
  if (record.__fault !== true) return "expected __fault: true"
  if (typeof record._tag !== "string") return "_tag must be a string"
  if (typeof record.name !== "string") return "name must be a string"
  for (const key of ["message", "description", "stack"]) {
    if (!isOptionalString(record[key])) return `${key} must be a string`
  }
  if (
    record.meta !== undefined
    && (typeof record.meta !== "object" || record.meta === null || Array.isArray(record.meta))
  ) {
    return "meta must be an object"
  }
  if (
    record.fields !== undefined
    && (typeof record.fields !== "object" || record.fields === null || Array.isArray(record.fields))
  ) {
    return "fields must be an object"
  }

  return undefined
}

const anythingArb = fc.anything({
  withBigInt: true,
  withDate: true,
  withMap: true,
  withNullPrototype: true,
  withObjectString: true,
  withSet: true,
  withSparseArray: true,
  withTypedArray: true,
})

// Arbitrary values almost never carry `__fault: true`, so mix in
// envelope-shaped objects to exercise the revive branch and each
// validation guard (marker, _tag, name, meta, fields) in every run.
const envelopeArb = fc.record(
  {
    __fault: fc.oneof(fc.constant(true), anythingArb),
    _tag: fc.oneof(fc.string(), anythingArb),
    fields: fc.oneof(fc.dictionary(fc.string(), fc.jsonValue()), anythingArb),
    meta: fc.oneof(fc.dictionary(fc.string(), fc.jsonValue()), anythingArb),
    name: fc.oneof(fc.string(), anythingArb),
  },
  { requiredKeys: ["__fault", "_tag"] }
)

const payloadCandidateArb = fc.oneof(anythingArb, envelopeArb)

describe("fromSerializable", () => {
  it("restores every wire field under fields without loss or prototype changes", () => {
    fc.assert(
      fc.property(wireFieldsArb, (fields) => {
        const revived = fromSerializable(buildWire(fields))

        expect(Object.keys(revived.fields)).toEqual(Object.keys(fields))
        for (const [key, value] of Object.entries(fields)) {
          expect(Object.hasOwn(revived.fields, key)).toBe(true)
          expect(isDeepStrictEqual(revived.fields[key], value)).toBe(true)
        }
        expect(Object.getPrototypeOf(revived.fields)).toBe(Object.prototype)
        expect(typeof revived.unwrap).toBe("function")
        expect(revived._tag).toBe("HostileError")
        expect(revived.message).toBe("hostile")
      })
    )
  })

  it("revives valid envelopes and rejects invalid input with the matching validation error", () => {
    fc.assert(
      fc.property(payloadCandidateArb, (input) => {
        const rejection = expectedRejection(input)
        const revive = () => fromSerializable(input)

        if (rejection === undefined) {
          const revived = revive()

          expect(revived).toBeInstanceOf(Fault)
          expect(revived._tag).toBe((input as SerializableFault)._tag)
        } else {
          expect(revive).toThrow(InvalidPayloadError)
          expect(revive).toThrow(expect.objectContaining({ fields: { reason: rejection } }))
        }
      })
    )
  })
})

// Envelopes with every typed field and a cause, where each may be malformed,
// including a nested fault envelope that only fails its own validation.
const causeArb = fc.oneof(
  anythingArb,
  fc.record({ kind: fc.constant("fault"), value: fc.oneof(envelopeArb, anythingArb) }),
  fc.record(
    {
      kind: fc.constant("error"),
      message: fc.oneof(fc.string(), anythingArb),
      name: fc.oneof(fc.string(), anythingArb),
      stack: fc.oneof(fc.string(), anythingArb),
    },
    { requiredKeys: ["kind"] }
  ),
  fc.record({ kind: fc.constant("thrown"), value: anythingArb })
)

const wireCandidateArb = fc.oneof(
  payloadCandidateArb,
  fc.record(
    {
      __fault: fc.constant(true),
      _tag: fc.string(),
      cause: causeArb,
      description: fc.oneof(fc.string(), anythingArb),
      message: fc.oneof(fc.string(), anythingArb),
      meta: fc.dictionary(fc.string(), fc.jsonValue()),
      name: fc.oneof(fc.string(), anythingArb),
      stack: fc.oneof(fc.string(), anythingArb),
    },
    { requiredKeys: ["__fault", "_tag"] }
  )
)

class ProbeFault extends Fault {
  constructor() {
    super("ProbeFault")
  }
}

const caughtArb = fc.oneof(
  anythingArb,
  anythingArb.map((cause) => new Error("caught", { cause })),
  anythingArb.map((cause) =>
    new ProbeFault().withCause(new Error("mid", { cause: new ProbeFault().withCause(cause) }))
  )
)

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string"
}

function wrapInFaultEdges(innermost: unknown, edges: number): unknown {
  let wire = innermost
  for (let depth = 0; depth < edges; depth += 1) {
    wire = { __fault: true, _tag: "X", cause: { kind: "fault", value: wire }, name: "X" }
  }
  return wire
}

function wrapInErrorEdges(innermost: unknown, edges: number): unknown {
  let cause = innermost
  for (let depth = 0; depth < edges; depth += 1) {
    cause = { cause, kind: "error", message: "m", name: "E" }
  }
  return { __fault: true, _tag: "X", cause, name: "X" }
}

describe("isSerializableFault", () => {
  it("never accepts input that fromSerializable rejects", () => {
    fc.assert(
      fc.property(wireCandidateArb, (input) => {
        if (isSerializableFault(input)) {
          expect(() => fromSerializable(input)).not.toThrow()
        }
      })
    )
  })

  it("only accepts envelopes whose typed fields match SerializableFault", () => {
    fc.assert(
      fc.property(wireCandidateArb, (input) => {
        if (!isSerializableFault(input)) return

        expect(typeof input.name).toBe("string")
        expect(isOptionalString(input.message)).toBe(true)
        expect(isOptionalString(input.description)).toBe(true)
        expect(isOptionalString(input.stack)).toBe(true)
      })
    )
  })

  it("accepts every payload toSerializable produces, before and after JSON transport", () => {
    fc.assert(
      fc.property(caughtArb, (caught) => {
        const serialized = toSerializable(caught)
        const body = JSON.stringify(serialized)
        const transported: unknown = JSON.parse(body)

        expect(isSerializableFault(serialized)).toBe(true)
        expect(isSerializableFault(transported)).toBe(true)
      })
    )
  })

  it("accepts serializer output for chains longer than the depth budget", () => {
    let faultChain: unknown = new Error("root")
    let errorChain: unknown = new Error("root")

    for (let depth = 0; depth < MAX_CAUSE_DEPTH + 20; depth += 1) {
      faultChain = new ProbeFault().withCause(faultChain)
      errorChain = new Error(`e${depth}`, { cause: errorChain })
    }

    for (const caught of [faultChain, errorChain]) {
      const body = JSON.stringify(toSerializable(caught))
      const transported: unknown = JSON.parse(body)

      expect(isSerializableFault(transported)).toBe(true)
    }
  })

  it("rejects any cause left past the depth budget, valid or not", () => {
    const leaf = { __fault: true, _tag: "X", name: "X" }

    expect(isSerializableFault(wrapInFaultEdges(leaf, MAX_CAUSE_DEPTH))).toBe(true)
    expect(
      isSerializableFault(wrapInFaultEdges({ ...leaf, cause: { kind: "fault" } }, MAX_CAUSE_DEPTH))
    ).toBe(false)
    expect(
      isSerializableFault(wrapInErrorEdges({ kind: "thrown", value: 1 }, MAX_CAUSE_DEPTH - 1))
    ).toBe(true)
    expect(isSerializableFault(wrapInErrorEdges(null, MAX_CAUSE_DEPTH))).toBe(false)
    expect(
      isSerializableFault(wrapInErrorEdges({ kind: "thrown", value: 1 }, MAX_CAUSE_DEPTH))
    ).toBe(false)
  })
})
