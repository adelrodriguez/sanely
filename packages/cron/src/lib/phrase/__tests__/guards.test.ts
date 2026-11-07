import fc from "fast-check"
import { describe, expect, it } from "vitest"
import type { GrammarRow } from "#lib/grammar/__tests__/grammar.table.ts"
import { GRAMMAR } from "#lib/grammar/__tests__/grammar.table.ts"
import { isCronPhrase, isValidCronPhrase } from "#lib/phrase/guards.ts"
import { safeParse } from "#lib/phrase/parse.ts"

const ROWS: readonly GrammarRow[] = GRAMMAR

// Strings made of language words, so that the property tests also find valid phrases.
const WORDS = [
  "every",
  "minute",
  "minutes",
  "hour",
  "hours",
  "day",
  "at",
  "on",
  "the",
  "of",
  "month",
  "between",
  "and",
  "monday",
  "friday,",
  "weekday",
  "weekdays",
  "15",
  "2",
  "7",
  "1st",
  "9:30",
  "17:00",
  "noon",
  "hourly",
  "Mins",
  "MON",
]
const wordPhrase = fc
  .array(fc.constantFrom(...WORDS), { maxLength: 10, minLength: 1 })
  .chain((words) =>
    fc
      .array(fc.constantFrom(" ", " ", " ", "  ", "\t", ", "), {
        maxLength: words.length,
        minLength: words.length,
      })
      .map((spaces) =>
        words
          .map((word, index) => `${word}${spaces[index]}`)
          .join("")
          .trimEnd()
      )
  )
const anyPhrase = fc.oneof(
  fc.string(),
  wordPhrase,
  fc.constantFrom(...ROWS.map((row) => row.phrase))
)

describe("isCronPhrase", () => {
  for (const row of ROWS) {
    it(`should return ${row.strict} for ${JSON.stringify(row.phrase)}`, () => {
      expect(isCronPhrase(row.phrase)).toBe(row.strict)
    })
  }

  it("should return true only for a phrase that isValidCronPhrase accepts", () => {
    fc.assert(
      fc.property(anyPhrase, (value) => {
        if (isCronPhrase(value)) expect(isValidCronPhrase(value)).toBe(true)
      }),
      { numRuns: 2000 }
    )
  })
})

describe("isValidCronPhrase", () => {
  for (const row of ROWS) {
    it(`should return ${row.lenient} for ${JSON.stringify(row.phrase)}`, () => {
      expect(isValidCronPhrase(row.phrase)).toBe(row.lenient)
    })
  }

  it("should agree with safeParse for arbitrary strings", () => {
    fc.assert(
      fc.property(anyPhrase, (value) => {
        expect(isValidCronPhrase(value)).toBe(safeParse(value) !== null)
      }),
      { numRuns: 2000 }
    )
  })
})

describe("guards", () => {
  it("should return false for a value that is not a string", () => {
    for (const value of [undefined, null, 15, {}, ["every minute"]]) {
      // The values are not strings, the same as untyped input from JavaScript.
      expect(isCronPhrase(value as string)).toBe(false)
      expect(isValidCronPhrase(value as string)).toBe(false)
    }
  })

  it("should never throw", () => {
    fc.assert(
      fc.property(fc.oneof(anyPhrase, fc.anything()), (value) => {
        expect(() => isCronPhrase(value as string)).not.toThrow()
        expect(() => isValidCronPhrase(value as string)).not.toThrow()
      })
    )
  })
})
