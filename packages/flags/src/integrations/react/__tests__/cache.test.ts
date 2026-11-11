import { describe, expect, test } from "vitest"
import { FreshMarks } from "#integrations/react/cache.ts"

describe("FreshMarks", () => {
  test("keeps at most maxSlots fresh reads for a cleared subject, and reads a dropped slot fresh again", () => {
    // A cleared subject keeps its record, so each new slot, such as one for an identity object whose
    // key function throws, would otherwise stay for good.
    const marks = new FreshMarks(2)
    marks.clear(["subject"])

    for (const slot of ["a", "b", "c"]) {
      const fresh = marks.begin("subject", [slot])
      expect(fresh).toBeDefined()
      if (fresh) marks.read("subject", [slot], fresh)
    }

    // "b" and "c" are the two latest reads, so they stay read.
    expect(marks.begin("subject", ["c"])).toBeUndefined()
    expect(marks.begin("subject", ["b"])).toBeUndefined()
    // "a" was dropped, so it reads fresh once more instead of never.
    expect(marks.begin("subject", ["a"])).toBeDefined()
  })
})
