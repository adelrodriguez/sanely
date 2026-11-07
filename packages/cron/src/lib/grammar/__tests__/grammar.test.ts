import { describe, expect, it } from "vitest"
import { parseStrict } from "#lib/grammar/grammar.ts"
import { serialize } from "#lib/serialize/serialize.ts"
import type { GrammarRow } from "./grammar.table"
import { GRAMMAR } from "./grammar.table"

const ROWS: readonly GrammarRow[] = GRAMMAR

function getStrictReason(row: GrammarRow): string | undefined {
  if (row.strict) return undefined
  if (row.strictError !== undefined) return row.strictError
  return row.lenient ? undefined : row.error
}

describe("parseStrict", () => {
  for (const row of ROWS) {
    const reason = getStrictReason(row)

    if (row.strict) {
      it(`should parse ${JSON.stringify(row.phrase)} to "${row.cron}"`, () => {
        const result = parseStrict(row.phrase)

        expect(result.ok).toBe(true)
        if (result.ok) expect(serialize(result.fields)).toBe(row.cron)
      })
    } else {
      it(`should reject ${JSON.stringify(row.phrase)}${reason ? ` with "${reason}"` : ""}`, () => {
        const result = parseStrict(row.phrase)

        expect(result.ok).toBe(false)
        if (!result.ok && reason) expect(result.reason).toContain(reason)
      })
    }
  }

  it("should never restrict both the day of the month and the day of the week", () => {
    for (const row of ROWS) {
      const result = parseStrict(row.phrase)
      if (!result.ok) continue

      const { dayOfMonth, dayOfWeek } = result.fields
      expect(dayOfMonth.length === 31 || dayOfWeek.length === 7, row.phrase).toBe(true)
    }
  })

  it("should not catch errors that are not grammar errors", () => {
    expect(() => parseStrict("every 15 minutes")).not.toThrow()
  })
})
