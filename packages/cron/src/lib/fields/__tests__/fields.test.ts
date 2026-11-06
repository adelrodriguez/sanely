import { describe, expect, it } from "vitest"
import { FIELD_RANGES, createFields, every, range } from "#lib/fields/fields.ts"

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
