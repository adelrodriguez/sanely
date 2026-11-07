import fc from "fast-check"
import { describe as group, expect, it } from "vitest"
import type { Schedule } from "#lib/schedule/index.ts"
import { cron } from "#lib/api/cron.ts"
import { describe } from "#lib/api/describe.ts"
import { InvalidScheduleError } from "#lib/api/errors.ts"
import { parse } from "#lib/api/parse.ts"
import { scheduleArb, toCanonical } from "#lib/schedule/__tests__/index.arbitrary.ts"

group("describe", () => {
  it("should write the canonical phrase of a schedule", () => {
    expect(
      describe({ between: { from: 9, to: 17 }, every: "minute", interval: 15, on: "weekdays" })
    ).toBe("every 15 minutes between 9:00 and 17:00 on weekdays")
    expect(describe(parse("Every Mon, Wed And Fri At 9:30 PM"))).toBe(
      "every monday, wednesday and friday at 21:30"
    )
  })

  it("should give a phrase that parses to the canonical form of the schedule", () => {
    fc.assert(
      fc.property(scheduleArb, (schedule) => {
        expect(parse(describe(schedule))).toStrictEqual(toCanonical(schedule))
      })
    )
  })

  it("should give a phrase with the same cron expression as the schedule", () => {
    fc.assert(
      fc.property(scheduleArb, (schedule) => {
        expect(cron(describe(schedule))).toBe(cron(schedule))
      })
    )
  })

  it("should throw InvalidScheduleError for an invalid schedule at runtime", () => {
    // Untyped JavaScript, or a cast, can pass any value.
    const schedule = JSON.parse('{"every":"minute","interval":7}') as Schedule

    expect(() => describe(schedule)).toThrow(InvalidScheduleError)
    expect(() => describe(schedule)).toThrow("7 does not divide 60")
  })
})
