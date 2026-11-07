import { describe, expect, it } from "vitest"
import { createSchedule, range } from "#lib/schedule/schedule.ts"
import { toStandardCron } from "#lib/serialize/serialize.ts"

describe("toStandardCron", () => {
  it("should write a full field as *", () => {
    expect(toStandardCron(createSchedule({}))).toBe("* * * * *")
  })

  it("should write the fields in cron order", () => {
    expect(
      toStandardCron(
        createSchedule({ dayOfMonth: [1], dayOfWeek: [1], hour: [8], minute: [30], month: [6] })
      )
    ).toBe("30 8 1 6 1")
  })

  it("should write an interval from the start of the field as a step", () => {
    expect(toStandardCron(createSchedule({ minute: range(0, 59, 15) }))).toBe("*/15 * * * *")
    expect(toStandardCron(createSchedule({ hour: range(0, 23, 2), minute: [0] }))).toBe(
      "0 */2 * * *"
    )
    expect(toStandardCron(createSchedule({ month: range(1, 12, 3) }))).toBe("* * * */3 *")
  })

  it("should not write a step that does not start at the start of the field", () => {
    expect(toStandardCron(createSchedule({ minute: range(5, 59, 15) }))).toBe("5,20,35,50 * * * *")
  })

  it("should not write a step that does not divide the field", () => {
    expect(toStandardCron(createSchedule({ dayOfMonth: range(1, 31, 2) }))).toBe(
      "* * 1,3,5,7,9,11,13,15,17,19,21,23,25,27,29,31 * *"
    )
    expect(toStandardCron(createSchedule({ minute: range(0, 59, 7) }))).toBe(
      "0,7,14,21,28,35,42,49,56 * * * *"
    )
  })

  it("should write three or more consecutive values as a range", () => {
    expect(toStandardCron(createSchedule({ dayOfWeek: [1, 2, 3, 4, 5] }))).toBe("* * * * 1-5")
    expect(toStandardCron(createSchedule({ hour: range(9, 16) }))).toBe("* 9-16 * * *")
  })

  it("should write two consecutive values as a list", () => {
    expect(toStandardCron(createSchedule({ hour: [9, 10] }))).toBe("* 9,10 * * *")
    expect(toStandardCron(createSchedule({ dayOfWeek: [0, 6] }))).toBe("* * * * 0,6")
  })

  it("should mix ranges and lists", () => {
    expect(toStandardCron(createSchedule({ dayOfWeek: [0, 1, 2, 3, 5] }))).toBe("* * * * 0-3,5")
  })
})
