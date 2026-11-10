import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { normalizeThrown } from "#lib/wire.ts"

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

describe("normalizeThrown", () => {
  it("produces output that survives a JSON round trip identically", () => {
    fc.assert(
      fc.property(anythingArb, (value) => {
        const normalized = normalizeThrown(value)

        // undefined is the one non-JSON output, produced only for undefined input.
        if (normalized === undefined) {
          expect(value).toBeUndefined()
          return
        }

        // oxlint-disable-next-line unicorn/prefer-structured-clone -- the invariant under test is JSON transport stability.
        expect(JSON.parse(JSON.stringify(normalized))).toEqual(normalized)
      })
    )
  })

  it("is idempotent", () => {
    fc.assert(
      fc.property(anythingArb, (value) => {
        const once = normalizeThrown(value)

        expect(normalizeThrown(once)).toEqual(once)
      })
    )
  })

  it("normalizes non-finite numbers to null and keeps finite numbers", () => {
    fc.assert(
      fc.property(fc.double(), (value) => {
        const normalized = normalizeThrown(value)

        if (Number.isFinite(value)) {
          expect(Object.is(normalized, value === 0 ? 0 : value)).toBe(true)
        } else {
          expect(normalized).toBeNull()
        }
      })
    )
  })

  it("canonicalizes -0 to 0 like JSON.stringify", () => {
    expect(Object.is(normalizeThrown(-0), 0)).toBe(true)
  })
})
