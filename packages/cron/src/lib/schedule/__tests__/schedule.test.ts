import { describe, expect, it } from "vitest"
import type { ByKind, Schedule } from "#lib/schedule/schedule.ts"
import { isWindow, match } from "#lib/schedule/schedule.ts"

const NAMES = {
  day: (schedule) => `day at ${schedule.at.hour}`,
  hour: (schedule) => `hour ${schedule.interval ?? 1}`,
  minute: (schedule) => `minute ${schedule.interval ?? 1}`,
  month: (schedule) => `month on ${schedule.day}`,
} satisfies ByKind<string>

describe("match", () => {
  it.each<[Schedule, string]>([
    [{ every: "minute", interval: 15 }, "minute 15"],
    [{ every: "hour" }, "hour 1"],
    [{ at: { hour: 9, minute: 30 }, every: "day" }, "day at 9"],
    [{ at: { hour: 8, minute: 0 }, day: 3, every: "month" }, "month on 3"],
  ])("should call the row for the kind of %j", (schedule, expected) => {
    expect(match(schedule, NAMES)).toBe(expected)
  })
})

describe("isWindow", () => {
  it("should accept a window that ends after it starts", () => {
    expect(isWindow({ from: 9, to: 17 })).toBe(true)
    expect(isWindow({ from: 23, to: 24 })).toBe(true)
    expect(isWindow({ from: 0, to: 1 })).toBe(true)
  })

  it("should reject a window that ends at or before its start", () => {
    expect(isWindow({ from: 9, to: 9 })).toBe(false)
    expect(isWindow({ from: 17, to: 9 })).toBe(false)
  })
})
