import { describe, expect, it } from "vitest"

import * as FaultTypes from "#types.ts"

describe("types", () => {
  it("has no runtime exports from the types entrypoint", () => {
    expect(Object.keys(FaultTypes)).toEqual([])
  })
})
