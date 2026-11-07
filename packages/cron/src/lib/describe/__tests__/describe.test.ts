import fc from "fast-check"
import { describe, expect, it } from "vitest"
import type { GrammarRow } from "#lib/grammar/__tests__/grammar.table.ts"
import type { Schedule } from "#lib/schedule/schedule.ts"
import { writePhrase } from "#lib/describe/describe.ts"
import { GRAMMAR } from "#lib/grammar/__tests__/grammar.table.ts"
import { parsePhrase } from "#lib/grammar/grammar.ts"
import { scheduleArb, toCanonical } from "#lib/schedule/__tests__/schedule.arbitrary.ts"

const ROWS: readonly GrammarRow[] = GRAMMAR

describe("writePhrase", () => {
  it.each<[Schedule, string]>([
    [{ every: "minute" }, "every minute"],
    [{ every: "minute", interval: 15 }, "every 15 minutes"],
    [
      { between: { from: 9, to: 17 }, every: "minute", interval: 15, on: "weekdays" },
      "every 15 minutes between 9:00 and 17:00 on weekdays",
    ],
    [{ between: { from: 0, to: 24 }, every: "minute" }, "every minute between 0:00 and midnight"],
    [{ every: "minute", on: ["friday", "monday"] }, "every minute on monday and friday"],
    [{ every: "hour" }, "every hour"],
    [{ every: "hour", interval: 6, on: "weekends" }, "every 6 hours on weekends"],
    [{ at: { hour: 9, minute: 5 }, every: "day" }, "every day at 9:05"],
    [{ at: { hour: 17, minute: 30 }, every: "day", on: "weekdays" }, "every weekday at 17:30"],
    [
      { at: { hour: 8, minute: 0 }, every: "day", on: ["friday", "monday", "wednesday", "friday"] },
      "every monday, wednesday and friday at 8:00",
    ],
    [{ at: { hour: 0, minute: 0 }, every: "day", on: ["sunday"] }, "every sunday at 0:00"],
    [
      { at: { hour: 23, minute: 30 }, day: 2, every: "month" },
      "on the 2nd of every month at 23:30",
    ],
    [
      { at: { hour: 12, minute: 0 }, day: 11, every: "month" },
      "on the 11th of every month at 12:00",
    ],
  ])("should write %j as %j", (schedule, phrase) => {
    expect(writePhrase(schedule)).toBe(phrase)
  })

  it("should write the long form of a shortcut", () => {
    expect(writePhrase(parsePhrase("hourly"))).toBe("every hour")
    expect(writePhrase(parsePhrase("daily"))).toBe("every day at 0:00")
    expect(writePhrase(parsePhrase("weekly"))).toBe("every sunday at 0:00")
    expect(writePhrase(parsePhrase("monthly"))).toBe("on the 1st of every month at 0:00")
  })

  it("should write a strict phrase that parses to the schedule of each grammar row", () => {
    for (const row of ROWS) {
      if (row.lenient)
        expect(parsePhrase(writePhrase(row.schedule)), row.phrase).toStrictEqual(row.schedule)
    }
  })

  it("should write a strict phrase that parses to the canonical form of any schedule", () => {
    fc.assert(
      fc.property(scheduleArb, (schedule) => {
        expect(parsePhrase(writePhrase(schedule))).toStrictEqual(toCanonical(schedule))
      })
    )
  })
})
