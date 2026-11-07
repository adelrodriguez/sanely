import { describe, expect, it } from "vitest"

import * as Fault from "#index.ts"

describe("index", () => {
  it("exposes only the core runtime API from the root", () => {
    expect(Object.keys(Fault).toSorted()).toEqual([
      "Fault",
      "Tagged",
      "findCause",
      "fromSerializable",
      "isFault",
      "isSerializableFault",
      "matchTag",
      "matchTags",
      "merge",
      "registry",
      "toSerializable",
    ])
  })
})
