import { Cron } from "croner"
import fc from "fast-check"
import { describe, expect, it } from "vitest"
import type { GrammarRow } from "#lib/grammar/__tests__/grammar.table.ts"
import type { Schedule } from "#lib/schedule/schedule.ts"
import { GRAMMAR } from "#lib/grammar/__tests__/grammar.table.ts"
import { InvalidScheduleError } from "#lib/phrase/errors.ts"
import { isSchedule, parse, safeParse } from "#lib/phrase/parse.ts"
import { scheduleArb } from "#lib/schedule/__tests__/schedule.arbitrary.ts"
import { INVALID_OBJECTS, VALID_OBJECTS } from "#lib/validate/__tests__/validate.table.ts"

// The table phrases are literal types. The tests use them as `string`, the same as input from a
// config file.
const ROWS: readonly GrammarRow[] = GRAMMAR

function catchError(run: () => unknown): unknown {
  try {
    run()
  } catch (error) {
    return error
  }
  return undefined
}

describe("parse with a cron phrase", () => {
  for (const row of ROWS) {
    if (row.lenient) {
      it(`should parse ${JSON.stringify(row.phrase)} to its schedule`, () => {
        expect(parse(row.phrase)).toStrictEqual(row.schedule)
      })
    } else {
      it(`should reject ${JSON.stringify(row.phrase)} with "${row.error}"`, () => {
        const error = catchError(() => parse(row.phrase))

        expect(error).toBeInstanceOf(InvalidScheduleError)
        expect(error).toMatchObject({ path: [], value: row.phrase })
        expect((error as InvalidScheduleError).reason).toContain(row.error)
      })
    }
  }

  it("should build the message from the reason and the input", () => {
    expect(() => parse("every 7 minutes")).toThrow(
      'Invalid schedule: 7 does not divide 60. Use 2, 3, 4, 5, 6, 10, 12, 15, 20, or 30. Received: "every 7 minutes"'
    )
  })
})

describe("parse with a schedule object", () => {
  it.each(VALID_OBJECTS)("should parse %j", (value, expected) => {
    expect(parse(value)).toStrictEqual(expected)
  })

  it.each(INVALID_OBJECTS)("should reject %j with %j", (value, reason, path) => {
    const error = catchError(() => parse(value))

    expect(error).toBeInstanceOf(InvalidScheduleError)
    expect(error).toMatchObject({ path, value })
    expect((error as InvalidScheduleError).reason).toContain(reason)
  })

  it("should reject a value that is not a string or an object", () => {
    for (const value of [undefined, null, 15, true]) {
      expect(() => parse(value)).toThrow("is not a cron phrase or a schedule object")
    }
    expect(() => parse(["every minute"])).toThrow('["every minute"] is not a schedule object')
  })

  it("should read only own keys", () => {
    expect(() => parse(Object.create({ every: "hour" }))).toThrow(`the key "every" is required`)
    expect(() => parse(JSON.parse('{"every":"hour","__proto__":{"on":"weekdays"}}'))).toThrow(
      `"__proto__" is not a key of an hour schedule`
    )
  })

  it("should give a schedule for the JSON of any schedule", () => {
    fc.assert(
      fc.property(scheduleArb, (schedule) => {
        // The text that a config file or a request body holds.
        const json = JSON.stringify(schedule)

        expect(parse(JSON.parse(json))).toStrictEqual(schedule)
      })
    )
  })

  it("should return a copy of the input", () => {
    const value = { at: { hour: 9, minute: 0 }, every: "day", on: ["monday"] }
    const schedule = parse(value)

    expect(schedule).not.toBe(value)
    expect(schedule.every === "day" && schedule.at).not.toBe(value.at)
    expect(schedule.every === "day" && schedule.on).not.toBe(value.on)
  })

  it("should throw only InvalidScheduleError", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.anything(),
          scheduleArb.map((s) => ({ ...s, x: 1 }))
        ),
        (value) => {
          const error = catchError(() => parse(value))
          if (error !== undefined) expect(error).toBeInstanceOf(InvalidScheduleError)
        }
      )
    )
  })
})

describe("safeParse", () => {
  for (const row of ROWS) {
    it(`should return ${row.lenient ? "the schedule" : "null"} for ${JSON.stringify(row.phrase)}`, () => {
      expect(safeParse(row.phrase)).toStrictEqual(row.lenient ? row.schedule : null)
    })
  }

  it("should return null for an invalid schedule object", () => {
    for (const [value] of INVALID_OBJECTS) expect(safeParse(value)).toBeNull()
  })

  it("should agree with parse", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.anything(), fc.constantFrom(...ROWS.map((row) => row.phrase)), scheduleArb),
        (value) => {
          let parsed: Schedule | null
          try {
            parsed = parse(value)
          } catch {
            parsed = null
          }

          expect(safeParse(value)).toStrictEqual(parsed)
        }
      )
    )
  })
})

describe("isSchedule", () => {
  it("should accept every schedule", () => {
    fc.assert(
      fc.property(scheduleArb, (schedule) => {
        expect(isSchedule(schedule)).toBe(true)
      })
    )
  })

  it("should reject a cron phrase, because a phrase is not a schedule object", () => {
    expect(isSchedule("every hour")).toBe(false)
  })

  it("should reject an invalid schedule object", () => {
    for (const [value] of INVALID_OBJECTS) expect(isSchedule(value)).toBe(false)
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
