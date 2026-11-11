import { isDeepStrictEqual } from "node:util"
import fc from "fast-check"
import { describe, expect, it } from "vitest"

import type { Base as Fault } from "#index.ts"
import type { SerializableFault, SerializableValue } from "#types.ts"
import { InvalidPayloadError } from "#errors.ts"
import { fromSerializable, isFault, isSerializableFault, Tagged, toSerializable } from "#index.ts"

// Canonicalized through one JSON round trip because the wire itself is JSON:
// fc.jsonValue() can generate -0, which JSON.stringify canonicalizes to 0 and
// deep equality distinguishes from 0. Field and meta values are passed
// through verbatim by design — deep serializability is the consumer's
// documented contract — so unlike thrown causes (which normalizeThrown
// canonicalizes), a -0 here is expected to change across transport.
const jsonValueArb = fc
  .jsonValue({ maxDepth: 3 })
  // oxlint-disable-next-line unicorn/prefer-structured-clone -- structuredClone preserves -0; the point is JSON's canonicalization.
  .map((value) => JSON.parse(JSON.stringify(value)) as SerializableValue)

// Any name works as a field, so mix in names that collide with Fault methods,
// envelope keys, and Object.prototype.
const fieldKeyArb = fc.oneof(
  fc.string({ maxLength: 25, minLength: 1 }),
  fc.constantFrom("message", "_tag", "fields", "withMeta", "flatten", "toString", "__proto__")
)

const fieldsArb = fc.dictionary(fieldKeyArb, jsonValueArb, { maxKeys: 5 })

const metaArb = fc.dictionary(fc.string({ maxLength: 25, minLength: 1 }), jsonValueArb, {
  maxKeys: 3,
})

const tagArb = fc.string({ maxLength: 30, minLength: 1 })

type FaultSpec = {
  tag: string
  message: string | undefined
  description: string | undefined
  meta: Record<string, SerializableValue> | undefined
  fields: Record<string, SerializableValue>
  cause: CauseSpec | undefined
}

type CauseSpec =
  | { kind: "fault"; value: FaultSpec }
  | { kind: "error"; message: string }
  | { kind: "thrown"; value: SerializableValue }

const { faultSpecArb } = fc.letrec<{ faultSpecArb: FaultSpec; causeSpecArb: CauseSpec }>((tie) => ({
  causeSpecArb: fc.oneof(
    { depthSize: "small" },
    fc.record({ kind: fc.constant("thrown" as const), value: jsonValueArb }),
    fc.record({ kind: fc.constant("error" as const), message: fc.string() }),
    fc.record({ kind: fc.constant("fault" as const), value: tie("faultSpecArb") })
  ),
  faultSpecArb: fc.record({
    cause: fc.option(tie("causeSpecArb"), { nil: undefined }),
    description: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
    fields: fieldsArb,
    message: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
    meta: fc.option(metaArb, { nil: undefined }),
    tag: tagArb,
  }),
}))

function buildFault(spec: FaultSpec): Fault {
  class GeneratedFault extends Tagged(spec.tag)<Record<string, SerializableValue>>() {}
  const fault = new GeneratedFault(spec.fields)

  if (spec.message !== undefined) fault.withMessage(spec.message)
  if (spec.description !== undefined) fault.withDescription(spec.description)
  if (spec.meta !== undefined) fault.withMeta(spec.meta)

  if (spec.cause !== undefined) {
    if (spec.cause.kind === "fault") fault.withCause(buildFault(spec.cause.value))
    else if (spec.cause.kind === "error") fault.withCause(new Error(spec.cause.message))
    else fault.withCause(spec.cause.value)
  }

  return fault
}

// Walks the revived .cause chain directly, so the result reflects the reviver's
// depth cap rather than unwrap()'s own traversal cap.
function faultChain(head: Fault): Fault[] {
  const chain = [head]
  let node: unknown = head.cause
  while (isFault(node)) {
    chain.push(node)
    node = node.cause
  }
  return chain
}

function transport(value: Fault | SerializableFault): SerializableFault {
  // Intentionally a JSON round-trip: the properties under test cover transport
  // over a real wire, not structuredClone semantics.
  // oxlint-disable-next-line unicorn/prefer-structured-clone
  return JSON.parse(JSON.stringify(value)) as SerializableFault
}

describe("toSerializable", () => {
  it("serializes fields in their own object next to the envelope", () => {
    class NotFoundError extends Tagged("NotFoundError")<{ id: string; resource: string }>() {}

    const fault = new NotFoundError({ id: "123", resource: "user" })
      .withMessage("User not found")
      .withDescription("lookup failed")
      .withMeta({ requestId: "req-1" })

    expect(fault.toSerializable()).toStrictEqual({
      __fault: true,
      _tag: "NotFoundError",
      description: "lookup failed",
      fields: { id: "123", resource: "user" },
      message: "User not found",
      meta: { requestId: "req-1" },
      name: "NotFoundError",
      stack: fault.stack,
    })
  })

  it("preserves undefined values in the wire object while JSON applies standard semantics", () => {
    class UndefinedValueError extends Tagged("UndefinedValueError")() {}

    const serialized = new UndefinedValueError()
      .withMeta({ items: [1, undefined, 2], missing: undefined })
      .toSerializable()

    expect(Object.hasOwn(serialized.meta ?? {}, "missing")).toBe(true)
    expect(serialized.meta?.missing).toBeUndefined()
    expect(serialized.meta?.items).toEqual([1, undefined, 2])

    // Intentionally use a JSON round-trip to validate JSON transport semantics.
    // oxlint-disable-next-line unicorn/prefer-structured-clone
    const json = JSON.parse(JSON.stringify(serialized)) as { meta: Record<string, unknown> }

    expect(Object.hasOwn(json.meta, "missing")).toBe(false)
    expect(json.meta.items).toEqual([1, null, 2])
  })

  it("normalizes thrown functions", () => {
    class FunctionCauseError extends Tagged("FunctionCauseError")() {}

    const serialized = new FunctionCauseError().withCause(() => "ignored").toSerializable()

    expect(serialized.cause).toEqual({ kind: "thrown", value: "[Function]" })
  })

  it("normalizes thrown symbols", () => {
    class SymbolCauseError extends Tagged("SymbolCauseError")() {}

    const serialized = new SymbolCauseError().withCause(Symbol("reason")).toSerializable()

    expect(serialized.cause).toEqual({ kind: "thrown", value: "reason" })
  })

  it("normalizes thrown bigints", () => {
    class BigIntCauseError extends Tagged("BigIntCauseError")() {}

    const serialized = new BigIntCauseError().withCause(42n).toSerializable()

    expect(serialized.cause).toEqual({ kind: "thrown", value: "42" })
  })

  it("normalizes non-finite thrown numbers to null", () => {
    class NumberCauseError extends Tagged("NumberCauseError")() {}

    for (const nonFinite of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const serialized = new NumberCauseError().withCause(nonFinite).toSerializable()

      expect(serialized.cause).toEqual({ kind: "thrown", value: null })
    }

    const finite = new NumberCauseError().withCause(42).toSerializable()

    expect(finite.cause).toEqual({ kind: "thrown", value: 42 })
  })

  it("normalizes thrown objects through JSON", () => {
    class ObjectCauseError extends Tagged("ObjectCauseError")() {}
    const date = new Date("2026-01-02T03:04:05.000Z")

    const plainObject = new ObjectCauseError().withCause({ code: 42, nested: { retry: true } })
    const dateObject = new ObjectCauseError().withCause(date)

    expect(plainObject.toSerializable().cause).toEqual({
      kind: "thrown",
      value: { code: 42, nested: { retry: true } },
    })
    expect(dateObject.toSerializable().cause).toEqual({ kind: "thrown", value: date.toJSON() })
  })

  it("normalizes cyclic thrown causes for JSON round-trips", () => {
    class CyclicCauseError extends Tagged("CyclicCauseError")() {}
    const cyclic: { self?: unknown } = {}
    cyclic.self = cyclic
    const fault = new CyclicCauseError().withCause(cyclic)

    expect(fault.toSerializable().cause).toEqual({ kind: "thrown", value: "[object Object]" })

    // Intentionally stringify the Fault instance to exercise its toJSON wire format.
    // oxlint-disable-next-line unicorn/prefer-structured-clone
    const restored = fromSerializable(JSON.parse(JSON.stringify(fault)) as SerializableFault)

    expect(restored.cause).toBe("[object Object]")
  })

  it("survives any thrown cause, and the result always revives", () => {
    class SurvivorError extends Tagged("SurvivorError")() {}

    fc.assert(
      fc.property(
        fc.anything({
          withBigInt: true,
          withDate: true,
          withMap: true,
          withNullPrototype: true,
          withObjectString: true,
          withSet: true,
          withSparseArray: true,
          withTypedArray: true,
        }),
        (thrown) => {
          const fault = new SurvivorError().withCause(thrown)
          const wireCause = fault.toSerializable().cause
          const revived = fromSerializable(transport(fault))

          expect(revived._tag).toBe("SurvivorError")
          if (thrown === undefined) {
            expect(wireCause).toBeUndefined()
          } else {
            expect(wireCause?.kind).toBe("thrown")
          }
          // The normalized thrown value survives JSON transport unchanged.
          expect(revived.cause).toStrictEqual(
            wireCause?.kind === "thrown" ? wireCause.value : undefined
          )
        }
      )
    )
  })

  it("serializes a Fault with its own encoding", () => {
    class NotFoundError extends Tagged("NotFoundError")<{ id: string }>() {}
    const fault = new NotFoundError({ id: "123" }).withCause(new Error("root"))

    expect(toSerializable(fault)).toStrictEqual(fault.toSerializable())
  })

  it("serializes a native Error as UnknownError", () => {
    const error = new Error("boom")

    expect(toSerializable(error)).toStrictEqual({
      __fault: true,
      _tag: "UnknownError",
      cause: { kind: "error", message: "boom", name: "Error", stack: error.stack },
      message: "boom",
      name: "UnknownError",
    })
  })

  it("serializes non-Error thrown values as UnknownThrown", () => {
    expect(toSerializable("boom")).toStrictEqual({
      __fault: true,
      _tag: "UnknownThrown",
      cause: { kind: "thrown", value: "boom" },
      message: "UnknownThrown",
      name: "UnknownThrown",
    })
    expect(toSerializable(42).cause).toStrictEqual({ kind: "thrown", value: 42 })
    expect(toSerializable(null).cause).toStrictEqual({ kind: "thrown", value: null })
  })

  it("normalizes non-serializable thrown values", () => {
    const cyclic: { self?: unknown } = {}
    cyclic.self = cyclic

    expect(toSerializable(cyclic).cause).toStrictEqual({ kind: "thrown", value: "[object Object]" })
  })

  it("round-trips UnknownError through fromSerializable", () => {
    const restored = fromSerializable(toSerializable(new Error("boom")))

    expect(restored._tag).toBe("UnknownError")
    expect(restored.message).toBe("boom")
  })
})

function withCause(cause: unknown) {
  return { __fault: true, _tag: "Outer", cause, name: "Outer" }
}

describe("isSerializableFault", () => {
  it("returns true for a wire payload that survived JSON transport", () => {
    const body = JSON.stringify(toSerializable(new Error("boom")))
    const received: unknown = JSON.parse(body)

    expect(isSerializableFault(received)).toBe(true)
  })

  it("returns false for values fromSerializable rejects", () => {
    expect(isSerializableFault({ __fault: false, _tag: "X" })).toBe(false)
    expect(isSerializableFault({ __fault: true, _tag: 1 })).toBe(false)
    expect(isSerializableFault({ __fault: true, _tag: "X", meta: "nope" })).toBe(false)
    expect(isSerializableFault(new Error("boom"))).toBe(false)
    expect(isSerializableFault(null)).toBe(false)
  })

  it("returns false when a typed envelope field has the wrong type", () => {
    expect(isSerializableFault({ __fault: true, _tag: "X" })).toBe(false)
    expect(isSerializableFault({ __fault: true, _tag: "X", message: 42, name: "X" })).toBe(false)
    expect(isSerializableFault({ __fault: true, _tag: "X", description: 1, name: "X" })).toBe(false)
    expect(isSerializableFault({ __fault: true, _tag: "X", name: "X", stack: false })).toBe(false)
  })

  it("returns false when a nested cause fromSerializable visits is invalid", () => {
    const invalidFault = { __fault: true, _tag: "Inner", meta: null, name: "Inner" }

    expect(() =>
      fromSerializable(withCause({ kind: "fault", value: invalidFault }) as SerializableFault)
    ).toThrow()
    expect(isSerializableFault(withCause({ kind: "fault", value: invalidFault }))).toBe(false)
    expect(
      isSerializableFault(
        withCause({
          cause: { kind: "fault", value: invalidFault },
          kind: "error",
          message: "m",
          name: "E",
        })
      )
    ).toBe(false)
    expect(isSerializableFault(withCause({ kind: "error", name: "E" }))).toBe(false)
    expect(isSerializableFault(withCause({ kind: "unknown" }))).toBe(false)
    expect(isSerializableFault(withCause(null))).toBe(false)
  })
})

describe("fromSerializable", () => {
  it("throws InvalidPayloadError for invalid payloads", () => {
    expect(() => fromSerializable({ __fault: false })).toThrow(
      new InvalidPayloadError({ reason: "expected __fault: true" })
    )
  })

  it("rejects a malformed cause instead of dropping it", () => {
    expect(() =>
      fromSerializable(withCause({ __fault: true, _tag: "Inner", name: "Inner" }))
    ).toThrow(
      new InvalidPayloadError({ reason: "cause at depth 1: kind must be fault, error, or thrown" })
    )
    expect(() => fromSerializable(withCause({ kind: "error", message: "m" }))).toThrow(
      new InvalidPayloadError({ reason: "cause at depth 1: name must be a string" })
    )
  })

  it("rejects meta that is an array", () => {
    expect(() => fromSerializable({ __fault: true, _tag: "X", meta: ["a"], name: "X" })).toThrow(
      new InvalidPayloadError({ reason: "meta must be an object" })
    )
  })

  it("rejects fields that are not an object", () => {
    expect(() => fromSerializable({ __fault: true, _tag: "X", fields: "id", name: "X" })).toThrow(
      new InvalidPayloadError({ reason: "fields must be an object" })
    )
  })

  it("keeps a __proto__ field as an own data key without changing any prototype", () => {
    const wire: unknown = JSON.parse(
      '{"__fault":true,"_tag":"PrototypeError","name":"PrototypeError","fields":{"__proto__":"value"}}'
    )

    const revived = fromSerializable(wire)

    expect(Object.getOwnPropertyDescriptor(revived.fields, "__proto__")?.value).toBe("value")
    expect(Object.getPrototypeOf(revived.fields)).toBe(Object.prototype)
    expect(Object.hasOwn(revived, "__proto__")).toBe(false)
  })

  it("rejects a hand-built chain deeper than the depth limit without overflowing the stack", () => {
    // The serializer never writes more than MAX_CAUSE_DEPTH (100) nested causes,
    // so a deeper wire is malformed.
    let current: SerializableFault = {
      __fault: true,
      _tag: "LeafError",
      message: "leaf",
      name: "LeafError",
    }

    for (let i = 0; i < 10_000; i += 1) {
      current = {
        __fault: true,
        _tag: "WrapperError",
        cause: { kind: "fault", value: current },
        name: "WrapperError",
      }
    }

    expect(() => fromSerializable(current)).toThrow(
      new InvalidPayloadError({
        reason: "cause at depth 101: exceeds the limit of 100 nested causes",
      })
    )
  })

  it("throws when meta is not an object", () => {
    expect(() =>
      fromSerializable({
        __fault: true,
        _tag: "TestError",
        meta: "not-an-object",
        name: "TestError",
      })
    ).toThrow("meta must be an object")
  })

  it("preserves tag, message, description, meta, and fields across any JSON transport round trip", () => {
    fc.assert(
      fc.property(faultSpecArb, (spec) => {
        const fault = buildFault(spec)
        const revived = fromSerializable(transport(fault))

        expect(revived._tag).toBe(fault._tag)
        expect(revived.message).toBe(fault.message)
        expect(revived.description).toEqual(fault.description)
        expect(revived.meta).toEqual(fault.meta)

        expect(Object.keys(revived.fields)).toEqual(Object.keys(spec.fields))
        for (const [key, value] of Object.entries(spec.fields)) {
          expect(isDeepStrictEqual(revived.fields[key], value)).toBe(true)
        }
      })
    )
  })

  it("preserves the tag chain and merged context for any cause chain", () => {
    fc.assert(
      fc.property(faultSpecArb, (spec) => {
        const fault = buildFault(spec)
        const revived = fromSerializable(transport(fault))

        expect(revived.getTags()).toEqual(fault.getTags())
        expect(revived.getContext()).toEqual(fault.getContext())
      })
    )
  })

  it("re-serializes a revived fault to the same wire object", () => {
    fc.assert(
      fc.property(faultSpecArb, (spec) => {
        const fault = buildFault(spec)
        const wire = transport(fault)
        const revived = fromSerializable(wire)

        expect(transport(revived)).toEqual(wire)
      })
    )
  })

  // Each of the 30 cases builds a cause chain of up to 150 links, then serializes and revives it.
  // That takes about 0.5 s alone on a 4-core machine, and more than 5 s when the root `pnpm test`
  // runs every package at once, so the 5 s default fails on a busy machine.
  it("caps revived cause chains at the documented depth of 100", () => {
    class LinkError extends Tagged("LinkError")<{ index: number }>() {}

    fc.assert(
      fc.property(
        fc.oneof(fc.constantFrom(0, 1, 99, 100, 101, 150), fc.integer({ max: 150, min: 0 })),
        (edges) => {
          let fault: Fault = new LinkError({ index: 0 })
          for (let index = 1; index <= edges; index += 1) {
            // Assign cause directly: withCause() nests every inner stack into
            // each outer one, which grows quadratically and times out at depth 150.
            const link: Fault = new LinkError({ index })
            link.cause = fault
            fault = link
          }

          const chain = faultChain(fromSerializable(transport(fault)))
          const keptEdges = Math.min(edges, 100)

          // The outermost fault is kept and the innermost links are dropped.
          expect(chain.map((link) => (link as LinkError).fields.index)).toStrictEqual(
            Array.from({ length: keptEdges + 1 }, (_, offset) => edges - offset)
          )
          expect(chain.at(-1)?.cause).toBeUndefined()
        }
      ),
      { numRuns: 30 }
    )
  }, 60_000)
})
