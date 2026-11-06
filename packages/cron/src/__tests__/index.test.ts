import { describe, expect, it } from "vitest"
import * as plaincron from "#index.ts"

describe("public entry", () => {
  it("should export the public functions and the error", () => {
    expect(Object.keys(plaincron).toSorted()).toEqual([
      "InvalidCronPhraseError",
      "cron",
      "isCronPhrase",
      "isValidCronPhrase",
      "parse",
      "safeParse",
    ])
  })

  it("should convert a phrase end to end", () => {
    expect(plaincron.cron("every 15 minutes between 9:00 and 17:00 on weekdays")).toBe(
      "*/15 9-16 * * 1-5"
    )
    expect(plaincron.parse("Every Mon, Wed and Fri at 9:30 PM")).toBe("30 21 * * 1,3,5")
    expect(plaincron.safeParse("every 7 minutes")).toBeNull()
    expect(() => plaincron.parse("every 90 minutes")).toThrow(plaincron.InvalidCronPhraseError)
  })
})
