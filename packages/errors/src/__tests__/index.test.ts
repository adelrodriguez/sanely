import { describe, expect, it } from "vitest"

import * as Faultier from "#index.ts"

describe("index", () => {
  it("exposes only the core runtime API from the root", () => {
    expect(Object.keys(Faultier).toSorted()).toEqual([
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
