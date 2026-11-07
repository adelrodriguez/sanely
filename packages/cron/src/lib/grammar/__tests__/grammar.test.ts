import { describe, expect, it } from "vitest"
import { toFields } from "#lib/fields/fields.ts"
import { parsePhrase } from "#lib/grammar/grammar.ts"
import { ParseError } from "#lib/schedule/rules.ts"
import { serialize } from "#lib/serialize/serialize.ts"
import type { GrammarRow } from "./grammar.table"
import { GRAMMAR } from "./grammar.table"

const ROWS: readonly GrammarRow[] = GRAMMAR

function getStrictReason(row: GrammarRow): string | undefined {
  if (row.strict) return undefined
  if (row.strictError !== undefined) return row.strictError
  return row.lenient ? undefined : row.error
}

describe("parsePhrase", () => {
  for (const row of ROWS) {
    const reason = getStrictReason(row)

    if (row.strict) {
      it(`should parse ${JSON.stringify(row.phrase)} to its schedule`, () => {
        const schedule = parsePhrase(row.phrase)

        expect(schedule).toStrictEqual(row.schedule)
        expect(serialize(toFields(schedule))).toBe(row.cron)
      })
    } else {
      it(`should reject ${JSON.stringify(row.phrase)}${reason ? ` with "${reason}"` : ""}`, () => {
        expect(() => parsePhrase(row.phrase)).toThrow(ParseError)
        if (reason) expect(() => parsePhrase(row.phrase)).toThrow(reason)
      })
    }
  }

  it("should return a new object each time", () => {
    const first = parsePhrase("weekly")

    expect(parsePhrase("weekly")).not.toBe(first)
    expect(parsePhrase("weekly")).toStrictEqual(first)
  })
})
