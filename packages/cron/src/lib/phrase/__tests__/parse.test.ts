import { Cron } from "croner"
import fc from "fast-check"
import { describe, expect, it } from "vitest"
import type { GrammarRow } from "#lib/grammar/__tests__/grammar.table.ts"
import { GRAMMAR } from "#lib/grammar/__tests__/grammar.table.ts"
import { InvalidCronPhraseError } from "#lib/phrase/errors.ts"
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
        expect(() => parse(row.phrase)).toThrow(InvalidCronPhraseError)
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

    expect(caught).toBeInstanceOf(InvalidCronPhraseError)
    expect((caught as InvalidCronPhraseError).value).toBe("every 7 minutes")
    expect((caught as InvalidCronPhraseError).message).toBe(
      'Invalid cron phrase: 7 does not divide 60. Use 2, 3, 4, 5, 6, 10, 12, 15, 20, or 30. Received: "every 7 minutes"'
    )
  })

  it("should reject a value that is not a string", () => {
    for (const value of [undefined, null, 15, {}, ["every minute"]]) {
      // The values are not strings, the same as untyped input from JavaScript.
      expect(() => parse(value as string)).toThrow("the value is not a string")
    }
  })

  it("should throw only InvalidCronPhraseError", () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        try {
          parse(value)
        } catch (error) {
          expect(error).toBeInstanceOf(InvalidCronPhraseError)
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

// These tests prove the "exact or throw" rule. A generated phrase gives a cron expression. Croner
// computes its run times, and the test compares them with the run times that the phrase describes.
// All times are UTC, because schedules are exact in wall-clock time.

const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS

const DAY_NAMES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
// The JavaScript day number (0 = Sunday) of each day name.
const DAY_NUMBERS = [1, 2, 3, 4, 5, 6, 0]

interface Meaning {
  readonly phrase: string
  /**
   * The span of time to compare, from a start time.
   */
  readonly spanDays: number
  /**
   * Whether the phrase runs on the UTC day that starts at this time.
   */
  readonly matchesDay: (day: Date) => boolean
  /**
   * Whether the phrase runs at this UTC time of day, on a day that it runs.
   */
  readonly matchesTime: (hour: number, minute: number) => boolean
}

const EVERY_DAY = () => true

function formatList(names: readonly string[]): string {
  if (names.length <= 2) return names.join(" and ")
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
}

// A time and every strict spelling of it.
const timeArb = fc
  .record({ hour: fc.integer({ max: 23, min: 0 }), minute: fc.integer({ max: 59, min: 0 }) })
  .chain(({ hour, minute }) => {
    const mm = String(minute).padStart(2, "0")
    const hour12 = hour % 12 === 0 ? 12 : hour % 12
    const spellings = [`${hour}:${mm}`, `${String(hour).padStart(2, "0")}:${mm}`]
    if (!(hour12 === 12 && minute === 0))
      spellings.push(`${hour12}:${mm}${hour < 12 ? "am" : "pm"}`)
    if (hour === 12 && minute === 0) spellings.push("noon")
    if (hour === 0 && minute === 0) spellings.push("midnight")
    return fc.constantFrom(...spellings).map((text) => ({ hour, minute, text }))
  })

// A day set after `every` or `on`, with the JavaScript day numbers that it selects.
interface DaySetSample {
  /**
   * The JavaScript day numbers.
   */
  readonly days: readonly number[]
  readonly text: string
}

const daySetArb = (context: "every" | "on"): fc.Arbitrary<DaySetSample> =>
  fc.oneof(
    fc.constant({ days: [1, 2, 3, 4, 5], text: context === "every" ? "weekday" : "weekdays" }),
    fc.constant({ days: [0, 6], text: context === "every" ? "weekend" : "weekends" }),
    fc.subarray([0, 1, 2, 3, 4, 5, 6], { minLength: 1 }).map((indexes) => ({
      days: indexes.map((index) => DAY_NUMBERS[index] ?? 0),
      text: formatList(indexes.map((index) => DAY_NAMES[index] ?? "")),
    }))
  )

// A window on the hour. The end is not included, and an end at midnight is the end of the day.
const windowArb = fc
  .integer({ max: 23, min: 0 })
  .chain((start) => fc.tuple(fc.constant(start), fc.integer({ max: 24, min: start + 1 })))
  .chain(([start, end]) => {
    const startTexts =
      start === 0 ? ["0:00", "midnight"] : start === 12 ? ["12:00", "noon"] : [`${start}:00`]
    const endTexts = end === 24 ? ["midnight"] : end === 12 ? ["12:00", "noon"] : [`${end}:00`]
    return fc
      .tuple(fc.constantFrom(...startTexts), fc.constantFrom(...endTexts))
      .map(([startText, endText]) => ({ end, start, text: `between ${startText} and ${endText}` }))
  })

const minuteIntervalArb: fc.Arbitrary<Meaning> = fc
  .record({
    days: fc.option(daySetArb("on"), { nil: undefined }),
    interval: fc.constantFrom(1, 2, 3, 4, 5, 6, 10, 12, 15, 20, 30),
    window: fc.option(windowArb, { nil: undefined }),
  })
  .map(({ days, interval, window }) => ({
    matchesDay: days ? (day: Date) => days.days.includes(day.getUTCDay()) : EVERY_DAY,
    matchesTime: (hour: number, minute: number) =>
      minute % interval === 0 && (!window || (hour >= window.start && hour < window.end)),
    phrase: [
      interval === 1 ? "every minute" : `every ${interval} minutes`,
      window?.text,
      days && `on ${days.text}`,
    ]
      .filter(Boolean)
      .join(" "),
    spanDays: 8,
  }))

const hourIntervalArb: fc.Arbitrary<Meaning> = fc
  .record({
    days: fc.option(daySetArb("on"), { nil: undefined }),
    interval: fc.constantFrom(1, 2, 3, 4, 6, 8, 12),
  })
  .map(({ days, interval }) => ({
    matchesDay: days ? (day: Date) => days.days.includes(day.getUTCDay()) : EVERY_DAY,
    matchesTime: (hour: number, minute: number) => minute === 0 && hour % interval === 0,
    phrase: [interval === 1 ? "every hour" : `every ${interval} hours`, days && `on ${days.text}`]
      .filter(Boolean)
      .join(" "),
    spanDays: 8,
  }))

const atTime = (time: { hour: number; minute: number }) => (hour: number, minute: number) =>
  hour === time.hour && minute === time.minute

const dailyArb: fc.Arbitrary<Meaning> = timeArb.map((time) => ({
  matchesDay: EVERY_DAY,
  matchesTime: atTime(time),
  phrase: `every day at ${time.text}`,
  spanDays: 8,
}))

const daysOfWeekArb: fc.Arbitrary<Meaning> = fc
  .tuple(daySetArb("every"), timeArb)
  .map(([days, time]) => ({
    matchesDay: (day: Date) => days.days.includes(day.getUTCDay()),
    matchesTime: atTime(time),
    phrase: `every ${days.text} at ${time.text}`,
    spanDays: 15,
  }))

const dayOfMonthArb: fc.Arbitrary<Meaning> = fc
  .tuple(fc.integer({ max: 28, min: 1 }), timeArb)
  .map(([day, time]) => {
    const suffix =
      day === 1 || day === 21
        ? "st"
        : day === 2 || day === 22
          ? "nd"
          : day === 3 || day === 23
            ? "rd"
            : "th"
    return {
      matchesDay: (date: Date) => date.getUTCDate() === day,
      matchesTime: atTime(time),
      phrase: `on the ${day}${suffix} of every month at ${time.text}`,
      spanDays: 70,
    }
  })

const meaningArb = fc.oneof(
  minuteIntervalArb,
  hourIntervalArb,
  dailyArb,
  daysOfWeekArb,
  dayOfMonthArb
)

// A start time in 2026 or 2027, on a whole minute.
const startArb = fc
  .integer({ max: Date.UTC(2028, 0, 1) / MINUTE_MS, min: Date.UTC(2026, 0, 1) / MINUTE_MS })
  .map((minutes) => minutes * MINUTE_MS)

// The times of day do not change from day to day, so the test finds them once in the 1440 minutes
// of a day. Then it walks the span one UTC day at a time.
function expectedRuns(meaning: Meaning, start: number): number[] {
  const end = start + meaning.spanDays * DAY_MS
  const timesOfDay: number[] = []
  for (let minuteOfDay = 0; minuteOfDay < DAY_MS / MINUTE_MS; minuteOfDay += 1) {
    if (meaning.matchesTime(Math.floor(minuteOfDay / 60), minuteOfDay % 60)) {
      timesOfDay.push(minuteOfDay * MINUTE_MS)
    }
  }

  const runs: number[] = []
  for (let day = start - (start % DAY_MS); day < end; day += DAY_MS) {
    if (!meaning.matchesDay(new Date(day))) continue
    for (const timeOfDay of timesOfDay) {
      const time = day + timeOfDay
      if (time >= start && time < end) runs.push(time)
    }
  }
  return runs
}

function cronRuns(expression: string, start: number, count: number): number[] {
  const cron = new Cron(expression, { utcOffset: 0 })
  // `nextRuns` returns the runs after the given time, so start one second before.
  return cron.nextRuns(count, new Date(start - 1000)).map((date) => date.getTime())
}

describe("parse exactness", () => {
  it("should run at exactly the times that the phrase describes", () => {
    fc.assert(
      fc.property(meaningArb, startArb, (meaning, start) => {
        const expression = parse(meaning.phrase)
        const expected = expectedRuns(meaning, start)
        const end = start + meaning.spanDays * DAY_MS

        const actual = cronRuns(expression, start, expected.length + 1).filter((time) => time < end)

        expect(actual).toEqual(expected)
      }),
      { numRuns: 400 }
    )
  })

  it("should have equal gaps for every minute interval and hour interval", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(1, 2, 3, 4, 5, 6, 10, 12, 15, 20, 30),
        startArb,
        (interval, start) => {
          const phrase = interval === 1 ? "every minute" : `every ${interval} minutes`
          const runs = cronRuns(parse(phrase), start, 200)
          const gaps = new Set(runs.slice(1).map((time, index) => time - (runs[index] ?? 0)))

          expect([...gaps]).toEqual([interval * MINUTE_MS])
        }
      )
    )

    for (const interval of [1, 2, 3, 4, 6, 8, 12]) {
      const phrase = interval === 1 ? "every hour" : `every ${interval} hours`
      const runs = cronRuns(parse(phrase), Date.UTC(2026, 0, 1), 100)
      const gaps = new Set(runs.slice(1).map((time, index) => time - (runs[index] ?? 0)))

      expect([...gaps]).toEqual([interval * 60 * MINUTE_MS])
    }
  })

  it("should reject every interval that has no exact single cron", () => {
    // For each interval, `*/N` is the only candidate cron. The language must contain the phrase
    // exactly when all gaps of `*/N` are equal.
    for (const [unit, cycle] of [
      ["minutes", 60],
      ["hours", 24],
    ] as const) {
      for (let interval = 2; interval < cycle; interval += 1) {
        const candidate = unit === "minutes" ? `*/${interval} * * * *` : `0 */${interval} * * *`
        const runs = cronRuns(candidate, Date.UTC(2026, 0, 1), 3 * cycle)
        const gaps = new Set(runs.slice(1).map((time, index) => time - (runs[index] ?? 0)))

        expect(safeParse(`every ${interval} ${unit}`) !== null, `every ${interval} ${unit}`).toBe(
          gaps.size === 1
        )
      }
    }
  })
})
