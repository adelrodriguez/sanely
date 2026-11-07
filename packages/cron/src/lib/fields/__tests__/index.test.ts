import { describe, expect, it } from "vitest"
import { FIELD_RANGES, createFields, every, range, toFields } from "#lib/fields/index.ts"

describe("range", () => {
  it("should include both ends", () => {
    expect(range(9, 12)).toEqual([9, 10, 11, 12])
  })

  it("should use the step", () => {
    expect(range(0, 59, 15)).toEqual([0, 15, 30, 45])
    expect(range(0, 23, 8)).toEqual([0, 8, 16])
  })

  it("should return one value when the ends are equal", () => {
    expect(range(5, 5)).toEqual([5])
  })
})

describe("every", () => {
  it("should return all values of each cron field", () => {
    for (const [field, [start, end]] of Object.entries(FIELD_RANGES)) {
      expect(every(field as keyof typeof FIELD_RANGES)).toEqual(range(start, end))
    }
  })

  it("should use the cron ranges", () => {
    expect(FIELD_RANGES).toEqual({
      dayOfMonth: [1, 31],
      dayOfWeek: [0, 6],
      hour: [0, 23],
      minute: [0, 59],
      month: [1, 12],
    })
  })
})

describe("createFields", () => {
  it("should select every minute when no field is given", () => {
    expect(createFields({})).toEqual({
      dayOfMonth: every("dayOfMonth"),
      dayOfWeek: every("dayOfWeek"),
      hour: every("hour"),
      minute: every("minute"),
      month: every("month"),
    })
  })

  it("should keep the given fields", () => {
    const schedule = createFields({ hour: [9], minute: [30] })

    expect(schedule.minute).toEqual([30])
    expect(schedule.hour).toEqual([9])
    expect(schedule.dayOfWeek).toEqual(every("dayOfWeek"))
  })

  it("should sort the days of the week", () => {
    expect(createFields({ dayOfWeek: [6, 0] }).dayOfWeek).toEqual([0, 6])
  })
})

describe("toFields", () => {
  it("should start a minute interval at :00 and leave out the window end", () => {
    expect(
      toFields({ between: { from: 9, to: 12 }, every: "minute", interval: 20, on: "weekends" })
    ).toEqual(createFields({ dayOfWeek: [0, 6], hour: [9, 10, 11], minute: [0, 20, 40] }))
  })

  it("should run an hour interval at :00 from 00:00", () => {
    expect(toFields({ every: "hour", interval: 8 })).toEqual(
      createFields({ hour: [0, 8, 16], minute: [0] })
    )
  })

  it("should give a day list in cron numbers, sorted and without duplicates", () => {
    expect(
      toFields({ at: { hour: 9, minute: 5 }, every: "day", on: ["sunday", "monday", "sunday"] })
    ).toEqual(createFields({ dayOfWeek: [0, 1], hour: [9], minute: [5] }))
  })

  it("should set only the day of the month for a month schedule", () => {
    expect(toFields({ at: { hour: 8, minute: 0 }, day: 15, every: "month" })).toEqual(
      createFields({ dayOfMonth: [15], hour: [8], minute: [0] })
    )
  })
})
