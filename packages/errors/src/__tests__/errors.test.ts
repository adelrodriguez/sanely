import { describe, expect, it } from "vitest"

import * as FaultErrors from "#errors.ts"

describe("errors", () => {
  it("exposes only library errors", () => {
    expect(Object.keys(FaultErrors).toSorted()).toEqual([
      "InvalidPayloadError",
      "RegistryMergeConflictError",
      "RegistryTagMismatchError",
      "ReservedFieldError",
    ])
  })
})
