import { describe, expect, it } from "vitest"
import { parseDescriptor, serializeDescriptor } from "#lib/protocol/descriptor.ts"
import { TargetResolutionError } from "#lib/protocol/errors.ts"

function captureResolutionError(operation: () => void): TargetResolutionError {
  try {
    operation()
  } catch (error) {
    if (error instanceof TargetResolutionError) {
      return error
    }

    throw error
  }

  throw new Error("Expected the operation to throw")
}

describe("deployment descriptor", () => {
  it("round-trips a deployment through the v1 wire format", () => {
    expect.assertions(2)

    const serialized = serializeDescriptor({
      builtAt: new Date("2026-08-09T12:00:00.000Z"),
      id: "abc123",
    })

    expect(serialized).toBe('{"v":1,"id":"abc123","builtAt":"2026-08-09T12:00:00.000Z"}')
    expect(parseDescriptor(serialized)).toStrictEqual({
      builtAt: new Date("2026-08-09T12:00:00.000Z"),
      id: "abc123",
    })
  })

  it("reports an invalid-json reason and retains the invalid text", () => {
    expect.assertions(1)

    const text = "<!doctype html><title>App</title>"
    const error = captureResolutionError(() => parseDescriptor(text))

    expect(error).toStrictEqual(new TargetResolutionError("invalid-json", text))
  })

  it("rejects a descriptor without a protocol version", () => {
    expect.assertions(1)
    expect(() => parseDescriptor('{"id":"abc123"}')).toThrow(
      new TargetResolutionError("unsupported-version")
    )
  })

  it("rejects an unknown non-forward protocol version", () => {
    expect.assertions(1)
    expect(() => parseDescriptor('{"v":0,"id":"abc123"}')).toThrow(
      new TargetResolutionError("unsupported-version")
    )
  })

  it("parses a higher protocol version when its id is usable", () => {
    expect.assertions(1)
    expect(parseDescriptor('{"v":2,"id":"future","newField":true}')).toStrictEqual({
      id: "future",
    })
  })

  it("drops invalid optional build metadata", () => {
    expect.assertions(1)
    expect(parseDescriptor('{"v":1,"id":"abc123","builtAt":"not-a-date"}')).toStrictEqual({
      id: "abc123",
    })
  })

  it.each(['{"v":1}', '{"v":1,"id":""}'])(
    "rejects an unusable deployment id in %s",
    (descriptor) => {
      expect.assertions(1)
      expect(() => parseDescriptor(descriptor)).toThrow(new TargetResolutionError("invalid-shape"))
    }
  )
})
