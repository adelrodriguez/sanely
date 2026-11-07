import { Cron } from "croner"
import fc from "fast-check"
import { describe, expect, it } from "vitest"
import type { GrammarRow } from "#lib/grammar/__tests__/grammar.table.ts"
import { GRAMMAR } from "#lib/grammar/__tests__/grammar.table.ts"
import { InvalidScheduleError } from "#lib/phrase/errors.ts"
import { parse, safeParse } from "#lib/phrase/parse.ts"

// The table phrases are literal types. The tests use them as `string`, the same as input from a
// config file.
const ROWS: readonly GrammarRow[] = GRAMMAR

describe("parse", () => {
  for (const row of ROWS) {
    if (row.lenient) {
      it(`should convert ${JSON.stringify(row.phrase)} to "${row.cron}"`, () => {
        expect(parse(row.phrase)).toBe(row.cron)
      })
    } else {
      it(`should reject ${JSON.stringify(row.phrase)} with "${row.error}"`, () => {
        expect(() => parse(row.phrase)).toThrow(InvalidScheduleError)
        expect(() => parse(row.phrase)).toThrow(row.error)
      })
    }
  }

  it("should store the input and the reason in the error", () => {
    let caught: unknown

    try {
      parse("every 7 minutes")
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(InvalidScheduleError)
    expect((caught as InvalidScheduleError).value).toBe("every 7 minutes")
    expect((caught as InvalidScheduleError).message).toBe(
      'Invalid schedule: 7 does not divide 60. Use 2, 3, 4, 5, 6, 10, 12, 15, 20, or 30. Received: "every 7 minutes"'
    )
  })

  it("should reject a value that is not a string", () => {
    for (const value of [undefined, null, 15, {}, ["every minute"]]) {
      // The values are not strings, the same as untyped input from JavaScript.
      expect(() => parse(value as string)).toThrow("the value is not a string")
    }
  })

  it("should throw only InvalidScheduleError", () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        try {
          parse(value)
        } catch (error) {
          expect(error).toBeInstanceOf(InvalidScheduleError)
        }
      })
    )
  })
})

describe("safeParse", () => {
  for (const row of ROWS) {
    it(`should return ${row.lenient ? `"${row.cron}"` : "null"} for ${JSON.stringify(row.phrase)}`, () => {
      expect(safeParse(row.phrase)).toBe(row.lenient ? row.cron : null)
    })
  }

  it("should never throw", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.anything()), (value) => {
        expect(() => safeParse(value as string)).not.toThrow()
      })
    )
  })

  it("should agree with parse", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.string(), fc.constantFrom(...ROWS.map((row) => row.phrase))),
        (value) => {
          let parsed: string | null
          try {
            parsed = parse(value)
          } catch {
            parsed = null
          }

          expect(safeParse(value)).toBe(parsed)
        }
      )
    )
  })
})

// `*/N` is the only candidate cron for an interval of N. The language must contain the phrase
// exactly when all gaps of `*/N` are equal.
describe("parse exactness", () => {
  it("should reject every interval that has no exact single cron", () => {
    for (const [unit, cycle] of [
      ["minutes", 60],
      ["hours", 24],
    ] as const) {
      for (let interval = 2; interval < cycle; interval += 1) {
        const candidate = unit === "minutes" ? `*/${interval} * * * *` : `0 */${interval} * * *`
        const runs = new Cron(candidate, { utcOffset: 0 })
          .nextRuns(3 * cycle, new Date(Date.UTC(2026, 0, 1)))
          .map((date) => date.getTime())
        const gaps = new Set(runs.slice(1).map((time, index) => time - (runs[index] ?? 0)))

        expect(safeParse(`every ${interval} ${unit}`) !== null, `every ${interval} ${unit}`).toBe(
          gaps.size === 1
        )
      }
    }
  })
})
