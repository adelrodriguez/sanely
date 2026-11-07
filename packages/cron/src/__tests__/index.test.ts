import { describe, expect, it } from "vitest"
import * as api from "#index.ts"

describe("public entry", () => {
  it("should export the public functions and the error", () => {
    expect(Object.keys(api).toSorted()).toEqual([
      "HOUR_INTERVALS",
      "InvalidScheduleError",
      "MINUTE_INTERVALS",
      "WEEKDAYS",
      "cron",
      "describe",
      "isCronPhrase",
      "isSchedule",
      "isValidCronPhrase",
      "parse",
      "safeParse",
    ])
  })

  it("should convert a phrase and a schedule end to end", () => {
    expect(api.cron("every 15 minutes between 9:00 and 17:00 on weekdays")).toBe(
      "*/15 9-16 * * 1-5"
    )
    expect(api.cron(api.parse("Every Mon, Wed and Fri at 9:30 PM"))).toBe("30 21 * * 1,3,5")
    expect(api.cron(api.parse({ at: { hour: 17, minute: 30 }, every: "day" }))).toBe("30 17 * * *")
    expect(api.safeParse("every 7 minutes")).toBeNull()
    expect(() => api.parse("every 90 minutes")).toThrow(api.InvalidScheduleError)
  })
})
