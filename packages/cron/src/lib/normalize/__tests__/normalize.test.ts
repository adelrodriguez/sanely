import fc from "fast-check"
import { describe, expect, it } from "vitest"
import type { GrammarRow } from "#lib/grammar/__tests__/grammar.table.ts"
import { GRAMMAR } from "#lib/grammar/__tests__/grammar.table.ts"
import { normalize } from "#lib/normalize/normalize.ts"

const ROWS: readonly GrammarRow[] = GRAMMAR
const STRICT_PHRASES = ROWS.filter((row) => row.strict).map((row) => row.phrase)

function changeCase(text: string, upper: readonly boolean[]): string {
  return text
    .split("")
    .map((char, index) => (upper[index] ? char.toUpperCase() : char))
    .join("")
}

describe("normalize", () => {
  it.each([
    ["Every 15 Minutes", "every 15 minutes"],
    ["  every   15\tminutes \n", "every 15 minutes"],
    ["every 15 minutes", "every 15 minutes"],
  ])("should change case and whitespace: %j", (input, expected) => {
    expect(normalize(input)).toBe(expected)
  })

  it.each([
    ["every 15 mins", "every 15 minutes"],
    ["every 15 min", "every 15 minutes"],
    ["every 15 m", "every 15 minutes"],
    ["every 5 minute", "every 5 minutes"],
    ["every min", "every minute"],
    ["every minutes", "every minute"],
    ["every 2 hrs", "every 2 hours"],
    ["every 2 hr", "every 2 hours"],
    ["every 2 h", "every 2 hours"],
    ["every hr", "every hour"],
  ])("should map a unit alias to the form after its previous word: %j", (input, expected) => {
    expect(normalize(input)).toBe(expected)
  })

  it.each([
    ["every 15m", "every 15 minutes"],
    ["every 2h", "every 2 hours"],
    ["every 2hrs on weekdays", "every 2 hours on weekdays"],
  ])("should split a unit alias from its number: %j", (input, expected) => {
    expect(normalize(input)).toBe(expected)
  })

  it("should not split a word that is not a unit alias", () => {
    expect(normalize("on the 1st of every month at 8:00")).toBe("on the 1st of every month at 8:00")
    expect(normalize("every 2mo")).toBe("every 2mo")
    expect(normalize("every 2d")).toBe("every 2d")
  })

  it.each([
    ["every mon at 9:30", "every monday at 9:30"],
    ["every tues and thurs at 9:30", "every tuesday and thursday at 9:30"],
    ["every sat and sun at 9:30", "every saturday and sunday at 9:30"],
    ["every mondays at 9:30", "every monday at 9:30"],
  ])("should map a day alias to its day name: %j", (input, expected) => {
    expect(normalize(input)).toBe(expected)
  })

  it.each([
    ["every weekdays at 9:00", "every weekday at 9:00"],
    ["every weekends at 9:00", "every weekend at 9:00"],
    ["every 15 minutes on weekday", "every 15 minutes on weekdays"],
    ["every 15 minutes on weekend", "every 15 minutes on weekends"],
  ])("should map a day group to the form after its previous word: %j", (input, expected) => {
    expect(normalize(input)).toBe(expected)
  })

  it.each([
    ["every mon,wed and fri at 9:30", "every monday, wednesday and friday at 9:30"],
    ["every mon , wed and fri at 9:30", "every monday, wednesday and friday at 9:30"],
    ["every mon, wed, and fri at 9:30", "every monday, wednesday and friday at 9:30"],
  ])("should change the list format: %j", (input, expected) => {
    expect(normalize(input)).toBe(expected)
  })

  it.each([
    ["every day at 9:30 PM", "every day at 9:30pm"],
    ["every day at 9:30PM", "every day at 9:30pm"],
    ["every day at 9:30 am", "every day at 9:30am"],
  ])("should join am and pm to the time: %j", (input, expected) => {
    expect(normalize(input)).toBe(expected)
  })

  it("should not add, remove, or reorder words", () => {
    expect(normalize("every friday and monday at 9:00")).toBe("every friday and monday at 9:00")
    expect(normalize("every morning at 9:00")).toBe("every morning at 9:00")
    expect(normalize("biweekly")).toBe("biweekly")
  })

  it("should not change a strict phrase", () => {
    for (const phrase of STRICT_PHRASES) {
      expect(normalize(phrase)).toBe(phrase)
    }
  })

  it("should give the strict phrase for any case and whitespace change of it", () => {
    const whitespace = fc.constantFrom(" ", "  ", "\t", " \n ", " ")

    fc.assert(
      fc.property(
        fc.constantFrom(...STRICT_PHRASES),
        fc.array(fc.boolean(), { maxLength: 120, minLength: 120 }),
        fc.array(whitespace, { maxLength: 20, minLength: 20 }),
        fc.string({ maxLength: 3, unit: fc.constantFrom(" ", "\t", "\n") }),
        (phrase, upper, spaces, edge) => {
          const words = changeCase(phrase, upper).split(" ")
          const changed = `${edge}${words.map((word, index) => `${word}${spaces[index] ?? " "}`).join("")}${edge}`

          expect(normalize(changed)).toBe(phrase)
        }
      )
    )
  })

  it("should be idempotent", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.string(), fc.constantFrom(...ROWS.map((row) => row.phrase))),
        (value) => {
          expect(normalize(normalize(value))).toBe(normalize(value))
        }
      )
    )
  })
})
