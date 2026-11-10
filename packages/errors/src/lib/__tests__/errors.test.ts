import { describe, expect, it } from "vitest"

import {
  InvalidPayloadError,
  RegistryConstructorError,
  RegistryMergeConflictError,
  RegistryNotRecognizedError,
  RegistryTagMismatchError,
  RegistryUnknownTagError,
} from "#lib/errors.ts"

describe("RegistryTagMismatchError", () => {
  it("exposes its tag, name, fields, and message", () => {
    const error = new RegistryTagMismatchError({
      ctorTag: "ActualError",
      registryKey: "ExpectedError",
    })

    expect(error._tag).toBe("RegistryTagMismatchError")
    expect(error.name).toBe("RegistryTagMismatchError")
    expect(error.fields.ctorTag).toBe("ActualError")
    expect(error.fields.registryKey).toBe("ExpectedError")
    expect(error.message).toBe(
      "Registry key 'ExpectedError' does not match constructor tag 'ActualError'."
    )
  })
})

describe("RegistryMergeConflictError", () => {
  it("exposes its tag, name, field, and message", () => {
    const error = new RegistryMergeConflictError({ conflictingTag: "ConflictError" })

    expect(error._tag).toBe("RegistryMergeConflictError")
    expect(error.name).toBe("RegistryMergeConflictError")
    expect(error.fields.conflictingTag).toBe("ConflictError")
    expect(error.message).toBe("Registry merge conflict for tag 'ConflictError'.")
  })
})

describe("RegistryUnknownTagError", () => {
  it("exposes its tag, name, field, and message", () => {
    const error = new RegistryUnknownTagError({ tag: "Nope" })

    expect(error._tag).toBe("RegistryUnknownTagError")
    expect(error.name).toBe("RegistryUnknownTagError")
    expect(error.fields.tag).toBe("Nope")
    expect(error.message).toBe("Unknown Fault registry tag 'Nope'.")
  })
})

describe("RegistryNotRecognizedError", () => {
  it("exposes its tag, name, and message", () => {
    const error = new RegistryNotRecognizedError()

    expect(error._tag).toBe("RegistryNotRecognizedError")
    expect(error.name).toBe("RegistryNotRecognizedError")
    expect(error.message).toBe("Expected a registry created by registry() or merge().")
  })
})

describe("RegistryConstructorError", () => {
  it("exposes its tag, name, field, and message", () => {
    const error = new RegistryConstructorError({ tag: "NotAFault" })

    expect(error._tag).toBe("RegistryConstructorError")
    expect(error.name).toBe("RegistryConstructorError")
    expect(error.fields.tag).toBe("NotAFault")
    expect(error.message).toBe(
      "The constructor registered for tag 'NotAFault' did not create a Fault."
    )
  })
})

describe("InvalidPayloadError", () => {
  it("exposes its tag, name, reason, and message", () => {
    const error = new InvalidPayloadError({ reason: "_tag must be a string" })

    expect(error._tag).toBe("InvalidPayloadError")
    expect(error.name).toBe("InvalidPayloadError")
    expect(error.fields.reason).toBe("_tag must be a string")
    expect(error.message).toBe("Invalid fault payload: _tag must be a string")
  })
})

describe("package error stacks", () => {
  it("start with the diagnostic message, not the tag", () => {
    const errors = [
      new InvalidPayloadError({ reason: "bad" }),
      new RegistryConstructorError({ tag: "X" }),
      new RegistryMergeConflictError({ conflictingTag: "X" }),
      new RegistryNotRecognizedError(),
      new RegistryTagMismatchError({ ctorTag: "Y", registryKey: "X" }),
      new RegistryUnknownTagError({ tag: "X" }),
    ]

    for (const error of errors) {
      expect(error.stack?.split("\n")[0]).toBe(`${error.name}: ${error.message}`)
    }
  })
})
