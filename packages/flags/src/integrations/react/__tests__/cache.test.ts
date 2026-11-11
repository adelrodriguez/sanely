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
      if (fresh) marks.read("subject", [slot], fresh, [slot])
    }

    // "b" and "c" are the two latest reads, so they stay read.
    expect(marks.begin("subject", ["c"])).toBeUndefined()
    expect(marks.begin("subject", ["b"])).toBeUndefined()
    // "a" was dropped, so it reads fresh once more instead of never.
    expect(marks.begin("subject", ["a"])).toBeDefined()
  })

  test("releases the slots of a fresh read that the provider did not answer", () => {
    const marks = new FreshMarks(2)
    marks.clear(["subject"])

    // Each identity object whose key function throws has its own slot, and its evaluation falls
    // back to the default, so the provider answers none of them.
    for (let index = 0; index < 10; index += 1) {
      const slot = `unkeyed:${index}`
      const fresh = marks.begin("subject", [slot])
      if (fresh) marks.read("subject", [slot], fresh, [])
    }

    expect(marks.tracked("subject")).toBe(0)
    // An unanswered slot keeps reading fresh.
    expect(marks.begin("subject", ["unkeyed:9"])).toBeDefined()
  })

  test("folds marks beyond maxSlots into a clear, so every marked slot still reads fresh", () => {
    const marks = new FreshMarks(2)

    for (let index = 0; index < 10; index += 1) marks.mark("subject", [`slot:${index}`])

    expect(marks.tracked("subject")).toBeLessThanOrEqual(2)
    for (let index = 0; index < 10; index += 1) {
      expect(marks.begin("subject", [`slot:${index}`])).toBeDefined()
    }
  })
})
