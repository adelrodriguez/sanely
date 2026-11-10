import { Cron } from "croner"
import fc from "fast-check"
import { describe, expect, it } from "vitest"
import type { GrammarRow } from "#lib/grammar/__tests__/index.table.ts"
import type { CronPhrase, DaySet, Schedule } from "#lib/schedule/index.ts"
import { cron } from "#lib/api/cron.ts"
import { InvalidScheduleError } from "#lib/api/errors.ts"
import { GRAMMAR } from "#lib/grammar/__tests__/index.table.ts"
import { scheduleArb } from "#lib/schedule/__tests__/index.arbitrary.ts"
import { HOUR_INTERVALS, MINUTE_INTERVALS } from "#lib/vocabulary/words.ts"

const ROWS: readonly GrammarRow[] = GRAMMAR

describe("cron with a phrase", () => {
  for (const row of ROWS) {
    if (!row.strict) continue

    it(`should convert ${JSON.stringify(row.phrase)} to "${row.cron}"`, () => {
      // The table types each phrase as `string`. The grammar table tests prove that each strict
      // row is a CronPhrase.
      expect(cron(row.phrase as CronPhrase)).toBe(row.cron)
    })
  }

  it("should throw InvalidScheduleError for an invalid phrase at runtime", () => {
    expect(() => cron("every 7 minutes" as CronPhrase)).toThrow(InvalidScheduleError)
    expect(() => cron("every 7 minutes" as CronPhrase)).toThrow("7 does not divide 60")
  })
})

describe("cron with a schedule", () => {
  it.each<[Schedule, string]>([
    [{ every: "minute" }, "* * * * *"],
    [{ every: "minute", interval: 15 }, "*/15 * * * *"],
    [
      { between: { from: 9, to: 17 }, every: "minute", interval: 15, on: "weekdays" },
      "*/15 9-16 * * 1-5",
    ],
    [{ between: { from: 18, to: 24 }, every: "minute", interval: 10 }, "*/10 18-23 * * *"],
    [{ every: "hour" }, "0 * * * *"],
    [{ every: "hour", interval: 6, on: "weekends" }, "0 */6 * * 0,6"],
    [{ at: { hour: 17, minute: 30 }, every: "day", on: ["monday", "friday"] }, "30 17 * * 1,5"],
    [
      { at: { hour: 9, minute: 0 }, every: "day", on: ["friday", "monday", "friday"] },
      "0 9 * * 1,5",
    ],
    [{ at: { hour: 0, minute: 0 }, every: "day" }, "0 0 * * *"],
    [{ at: { hour: 8, minute: 0 }, day: 1, every: "month" }, "0 8 1 * *"],
  ])("should convert %j to %j", (schedule, expected) => {
    expect(cron(schedule)).toBe(expected)
  })

  it("should throw InvalidScheduleError for an invalid schedule at runtime", () => {
    // Untyped JavaScript, or a cast, can pass any object.
    const schedule = JSON.parse('{"every":"minute","interval":7}') as Schedule

    expect(() => cron(schedule)).toThrow(InvalidScheduleError)
    expect(() => cron(schedule)).toThrow('Invalid schedule at "interval": 7 does not divide 60')
  })
})

// These tests prove the "exact or throw" rule. A generated schedule gives a cron expression.
// Croner computes its run times, and the test compares them with the run times that the schedule
// describes. All times are UTC, because schedules are exact in wall-clock time.

const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS

// The JavaScript day number (0 = Sunday) of each day name.
const DAY_NUMBERS: Readonly<Record<string, number>> = {
  friday: 5,
  monday: 1,
  saturday: 6,
  sunday: 0,
  thursday: 4,
  tuesday: 2,
  wednesday: 3,
}

function getDayNumbers(on: DaySet): readonly number[] {
  if (on === "weekdays") return [1, 2, 3, 4, 5]
  if (on === "weekends") return [0, 6]
  return on.map((day) => DAY_NUMBERS[day] ?? -1)
}

interface Meaning {
  /**
   * The span of time to compare, from a start time.
   */
  readonly spanDays: number
  /**
   * Whether the schedule runs on the UTC day that starts at this time.
   */
  readonly matchesDay: (day: Date) => boolean
  /**
   * Whether the schedule runs at this UTC time of day, on a day that it runs.
   */
  readonly matchesTime: (hour: number, minute: number) => boolean
}

const onDays = (on: DaySet | undefined) => (day: Date) =>
  on === undefined || getDayNumbers(on).includes(day.getUTCDay())

const atTime = (time: { hour: number; minute: number }) => (hour: number, minute: number) =>
  hour === time.hour && minute === time.minute

// The meaning of each kind of schedule, written from the schedule and not from the cron fields.
function getMeaning(schedule: Schedule): Meaning {
  switch (schedule.every) {
    case "minute": {
      const { between, interval = 1 } = schedule
      return {
        matchesDay: onDays(schedule.on),
        matchesTime: (hour, minute) =>
          minute % interval === 0 && (!between || (hour >= between.from && hour < between.to)),
        spanDays: 8,
      }
    }
    case "hour": {
      const { interval = 1 } = schedule
      return {
        matchesDay: onDays(schedule.on),
        matchesTime: (hour, minute) => minute === 0 && hour % interval === 0,
        spanDays: 8,
      }
    }
    case "day":
      return { matchesDay: onDays(schedule.on), matchesTime: atTime(schedule.at), spanDays: 15 }
    case "month":
      return {
        matchesDay: (date) => date.getUTCDate() === schedule.day,
        matchesTime: atTime(schedule.at),
        spanDays: 70,
      }
  }
}

// A start time in 2026 or 2027, on a whole minute.
const startArb = fc
  .integer({ max: Date.UTC(2028, 0, 1) / MINUTE_MS, min: Date.UTC(2026, 0, 1) / MINUTE_MS })
  .map((minutes) => minutes * MINUTE_MS)

// The times of day do not change from day to day, so the test finds them once in the 1440 minutes
// of a day. Then it walks the span one UTC day at a time.
function getExpectedRuns(meaning: Meaning, start: number): number[] {
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

function getCronRuns(expression: string, start: number, count: number): number[] {
  // `nextRuns` returns the runs after the given time, so start one second before.
  return new Cron(expression, { utcOffset: 0 })
    .nextRuns(count, new Date(start - 1000))
    .map((date) => date.getTime())
}

function getGaps(runs: readonly number[]): Set<number> {
  return new Set(runs.slice(1).map((time, index) => time - (runs[index] ?? 0)))
}

describe("cron exactness", () => {
  // Croner computes every run of 400 schedules, up to 11,520 runs each. That takes about 3 s alone,
  // and more than 20 s when the root `pnpm test` runs every package at once, so the 5 s default
  // fails on a busy machine.
  it("should run at exactly the times that the schedule describes", () => {
    fc.assert(
      fc.property(scheduleArb, startArb, (schedule, start) => {
        const meaning = getMeaning(schedule)
        const expected = getExpectedRuns(meaning, start)
        const end = start + meaning.spanDays * DAY_MS

        const actual = getCronRuns(cron(schedule), start, expected.length + 1).filter(
          (time) => time < end
        )

        expect(actual).toEqual(expected)
      }),
      { numRuns: 400 }
    )
  }, 60_000)

  it("should have equal gaps for every minute interval and hour interval", () => {
    fc.assert(
      fc.property(fc.constantFrom(undefined, ...MINUTE_INTERVALS), startArb, (interval, start) => {
        const runs = getCronRuns(cron({ every: "minute", interval }), start, 200)

        expect([...getGaps(runs)]).toEqual([(interval ?? 1) * MINUTE_MS])
      })
    )

    for (const interval of [undefined, ...HOUR_INTERVALS]) {
      const runs = getCronRuns(cron({ every: "hour", interval }), Date.UTC(2026, 0, 1), 100)

      expect([...getGaps(runs)]).toEqual([(interval ?? 1) * 60 * MINUTE_MS])
    }
  })
})
