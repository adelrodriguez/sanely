import { describe, expect, it } from "vitest"

import * as Fault from "#index.ts"

describe("index", () => {
  it("exposes only the core runtime API from the root", () => {
    expect(Object.keys(Fault).toSorted()).toEqual([
      "Base",
      "Tagged",
      "findCause",
      "fromSerializable",
      "is",
      "isFault",
      "isSerializable",
      "isSerializableFault",
      "matchTag",
      "matchTags",
      "merge",
      "registry",
      "toSerializable",
    ])
  })

  it("keeps the longer guard names as aliases of the namespace-style ones", () => {
    expect(Fault.isFault).toBe(Fault.is)
    expect(Fault.isSerializableFault).toBe(Fault.isSerializable)
  })
})
