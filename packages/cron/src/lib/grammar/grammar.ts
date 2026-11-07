import type { Fields } from "#lib/fields/fields.ts"
import type { Shortcut } from "#lib/vocabulary/words.ts"
import { createFields, range } from "#lib/fields/fields.ts"
import {
  DAY_GROUPS,
  DAYS,
  HOUR_INTERVALS,
  LAST_DAY_OF_MONTH as MAX_ORDINAL,
  MINUTE_INTERVALS,
  WEEKDAYS,
  formatChoices,
  getOrdinalSuffix,
  isOneOf,
  isWeekday,
} from "#lib/vocabulary/words.ts"

/**
 * The result of a parse: a schedule, or a reason that names the part of the phrase that failed.
 */
export type GrammarResult =
  | { readonly ok: true; readonly fields: Fields }
  | { readonly ok: false; readonly reason: string }

interface ClockTime {
  readonly hour: number
  readonly minute: number
}

const TIME_FORMATS = "Use H:MM or HH:MM (24-hour), H:MMam or H:MMpm, noon, or midnight"

// A Map, so that a lookup never finds a member of `Object.prototype`, such as "constructor". The
// `satisfies` check gives every shortcut a schedule and accepts no other key.
const SHORTCUT_SCHEDULES: ReadonlyMap<string, Partial<Fields>> = new Map(
  Object.entries({
    daily: { hour: [0], minute: [0] },
    hourly: { minute: [0] },
    monthly: { dayOfMonth: [1], hour: [0], minute: [0] },
    weekly: { dayOfWeek: [0], hour: [0], minute: [0] },
  } satisfies Record<Shortcut, Partial<Fields>>)
)

const GROUPS = Object.entries(DAY_GROUPS).map(([name, group]) => ({
  days: group.days,
  name,
  singular: group.singular,
}))

const DAY_SET_HINT = `Use monday to sunday, ${GROUPS.map((group) => group.singular).join(", ")}, or ${GROUPS.map((group) => group.name).join(", ")}`

class GrammarError extends Error {
  override name = "GrammarError"
}

function fail(reason: string): never {
  throw new GrammarError(reason)
}

class Cursor {
  #index = 0
  readonly #tokens: readonly string[]

  constructor(tokens: readonly string[]) {
    this.#tokens = tokens
  }

  /**
   * The text before the cursor, for reasons such as `expected "at" after "every monday"`.
   */
  get before(): string {
    return this.#tokens.slice(0, this.#index).join(" ")
  }

  get rest(): string {
    return this.#tokens.slice(this.#index).join(" ")
  }

  get done(): boolean {
    return this.#index >= this.#tokens.length
  }

  peek(): string | undefined {
    return this.#tokens[this.#index]
  }

  next(): string | undefined {
    const token = this.#tokens[this.#index]
    if (token !== undefined) this.#index += 1
    return token
  }

  expect(word: string): void {
    if (this.peek() !== word) fail(`expected "${word}" after "${this.before}"`)
    this.next()
  }

  expectEnd(): void {
    if (!this.done) fail(`unexpected text "${this.rest}" after "${this.before}"`)
  }
}

function parseInterval(token: string, unit: "minutes" | "hours"): number {
  if (!/^[1-9]\d*$/.test(token)) {
    fail(`"${token}" is not a valid interval. Use a whole number without a leading zero`)
  }

  const value = Number(token)
  const [cycle, intervals, single, next] =
    unit === "minutes"
      ? [60, MINUTE_INTERVALS, "every minute", "every hour"]
      : [24, HOUR_INTERVALS, "every hour", "every day at midnight"]

  if (isOneOf(intervals, value)) return value
  if (value === 1) fail(`use "${single}" for an interval of 1 ${unit.slice(0, -1)}`)
  if (value === cycle) fail(`use "${next}" for an interval of ${cycle} ${unit}`)

  const choices = `Use ${formatChoices(intervals)}`
  if (value < cycle) fail(`${token} does not divide ${cycle}. ${choices}`)
  return fail(`${token} ${unit} has no exact single cron. ${choices}`)
}

function parseTimeToken(token: string): ClockTime {
  if (token === "noon") return { hour: 12, minute: 0 }
  if (token === "midnight") return { hour: 0, minute: 0 }

  const clock = /^(\d{1,2}):([0-5]\d)$/.exec(token)
  if (clock) {
    const hour = Number(clock[1])
    if (hour <= 23) return { hour, minute: Number(clock[2]) }
  }

  const meridiem = /^([1-9]|1[0-2]):([0-5]\d)(am|pm)$/.exec(token)
  if (meridiem) {
    const hour = Number(meridiem[1])
    const minute = Number(meridiem[2])
    if (hour === 12 && minute === 0) {
      fail(`"${token}" is ambiguous. Use ${meridiem[3] === "am" ? "midnight" : "noon"}`)
    }
    return { hour: (hour % 12) + (meridiem[3] === "pm" ? 12 : 0), minute }
  }

  if (/^\d{1,2}$/.test(token)) {
    fail(
      `"${token}" is not a valid time. Write the minutes, such as "${token}:00", and use 24-hour time or am/pm`
    )
  }

  const bareMeridiem = /^(\d{1,2})(am|pm)$/.exec(token)
  if (bareMeridiem) {
    fail(
      `"${token}" is not a valid time. Write the minutes, such as "${bareMeridiem[1]}:00${bareMeridiem[2]}"`
    )
  }

  return fail(`"${token}" is not a valid time. ${TIME_FORMATS}`)
}

function parseTime(cursor: Cursor): ClockTime {
  const before = cursor.before
  const token = cursor.next()
  if (token === undefined) fail(`expected a time after "${before}"`)
  return parseTimeToken(token)
}

function formatDayList(names: readonly string[]): string {
  if (names.length <= 2) return names.join(" and ")
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
}

// The checks follow the same steps as the type-level validator, so that the reasons agree: first
// the day names, then duplicates, then the calendar order, and last the list format.
function parseDayList(words: readonly string[]): number[] {
  const names = words
    .filter((word) => word !== "and")
    .map((word) => (word.endsWith(",") ? word.slice(0, -1) : word))

  for (const name of names) {
    if (GROUPS.some((group) => group.singular === name || group.name === name)) {
      fail(`"${name}" cannot be part of a list of days`)
    }
    if (!isWeekday(name)) fail(`"${name}" is not a day. ${DAY_SET_HINT}`)
  }

  const duplicate = names.find((name, index) => names.indexOf(name) !== index)
  if (duplicate) fail(`"${duplicate}" is in the list more than one time`)

  const indexes = names.filter((name) => isWeekday(name)).map((name) => WEEKDAYS.indexOf(name))
  const sorted = indexes.toSorted((a, b) => a - b)
  if (sorted.some((index, position) => index !== indexes[position])) {
    fail(
      `list the days in calendar order, Monday first: "${formatDayList(sorted.map((index) => WEEKDAYS[index] ?? ""))}"`
    )
  }

  if (words.join(" ") !== formatDayList(names)) fail(`write the list as "${formatDayList(names)}"`)

  return names.filter((name) => isWeekday(name)).map((name) => DAYS[name].cron)
}

// A day set ends at the end of the phrase or at one of the stop words.
function parseDaySet(
  cursor: Cursor,
  context: "every" | "on",
  stopWords: readonly string[]
): number[] {
  const before = cursor.before
  const words: string[] = []
  while (!cursor.done && !stopWords.includes(cursor.peek() ?? "")) words.push(cursor.next() ?? "")

  if (words.length === 0) fail(`expected a day set after "${before}"`)

  const [only] = words
  const group = GROUPS.find((entry) => entry.singular === only || entry.name === only)
  if (words.length === 1 && group) {
    const expected = context === "every" ? group.singular : group.name
    if (only !== expected) fail(`use "${expected}" after "${context}"`)
    return group.days.map((day) => DAYS[day].cron)
  }

  return parseDayList(words)
}

function parseMinuteInterval(cursor: Cursor, interval: number): Partial<Fields> {
  const fields: { minute: number[]; hour?: number[]; dayOfWeek?: number[] } = {
    minute: range(0, 59, interval),
  }
  const atClause = `a minute interval cannot have an "at" clause. Use "between <time> and <time>" to limit it to a window`

  if (cursor.peek() === "between") {
    cursor.next()
    const startToken = cursor.peek() ?? ""
    const start = parseTime(cursor)
    cursor.expect("and")
    const endToken = cursor.peek() ?? ""
    const end = parseTime(cursor)

    if (start.minute !== 0)
      fail(`the window must start and end on the hour, and "${startToken}" is not on the hour`)
    if (end.minute !== 0)
      fail(`the window must start and end on the hour, and "${endToken}" is not on the hour`)

    // The end is not included. An end at midnight is the end of the day.
    const endHour = end.hour === 0 ? 24 : end.hour
    if (endHour <= start.hour) fail("the window must end after it starts")

    fields.hour = range(start.hour, endHour - 1)
  }

  if (cursor.peek() === "on") {
    cursor.next()
    fields.dayOfWeek = parseDaySet(cursor, "on", ["at", "between"])
    if (cursor.peek() === "between") fail(`the window clause must come before the "on" clause`)
  }

  if (cursor.peek() === "at") fail(atClause)
  cursor.expectEnd()
  return fields
}

function parseHourInterval(cursor: Cursor, interval: number): Partial<Fields> {
  const fields: { minute: number[]; hour: number[]; dayOfWeek?: number[] } = {
    hour: range(0, 23, interval),
    minute: [0],
  }

  if (cursor.peek() === "between") fail("an hour interval cannot have a window")

  if (cursor.peek() === "on") {
    cursor.next()
    fields.dayOfWeek = parseDaySet(cursor, "on", ["at", "between"])
  }

  if (cursor.peek() === "at") fail(`an hour interval cannot have an "at" clause`)
  if (cursor.peek() === "between") fail("an hour interval cannot have a window")
  cursor.expectEnd()
  return fields
}

function parseAt(cursor: Cursor): ClockTime {
  if (cursor.done) fail(`expected "at <time>" after "${cursor.before}"`)
  cursor.expect("at")
  const time = parseTime(cursor)
  cursor.expectEnd()
  return time
}

function parseEvery(cursor: Cursor): Partial<Fields> {
  const token = cursor.peek()
  if (token === undefined) fail(`expected an interval, "day", or a day set after "every"`)

  if (token === "minute" || token === "hour") {
    cursor.next()
    return token === "minute" ? parseMinuteInterval(cursor, 1) : parseHourInterval(cursor, 1)
  }

  if (token === "minutes" || token === "hours") {
    fail(`use "every ${token.slice(0, -1)}", or write a number before "${token}"`)
  }

  if (token === "day") {
    cursor.next()
    const { hour, minute } = parseAt(cursor)
    return { hour: [hour], minute: [minute] }
  }

  if (/^[+-]?[\d.]/.test(token)) {
    cursor.next()
    const before = cursor.before
    const unit = cursor.next()
    if (unit === undefined) fail(`expected "minutes" or "hours" after "${before}"`)
    if (unit === "minute" || unit === "hour") fail(`use "${unit}s" after a number`)
    if (unit !== "minutes" && unit !== "hours") {
      fail(`"${unit}" is not an interval unit. Use minutes or hours`)
    }

    const interval = parseInterval(token, unit)
    return unit === "minutes"
      ? parseMinuteInterval(cursor, interval)
      : parseHourInterval(cursor, interval)
  }

  const dayOfWeek = parseDaySet(cursor, "every", ["at"])
  const { hour, minute } = parseAt(cursor)
  return { dayOfWeek, hour: [hour], minute: [minute] }
}

function parseDayOfMonth(cursor: Cursor): Partial<Fields> {
  cursor.expect("the")

  const token = cursor.next()
  if (token === undefined) fail(`expected a day of the month after "on the"`)

  const match = /^([1-9]\d*)(st|nd|rd|th)$/.exec(token)
  const day = Number(match?.[1])
  if (!match || day > 31) fail(`"${token}" is not a day of the month. Use 1st to ${MAX_ORDINAL}th`)
  if (day > MAX_ORDINAL) {
    fail(`the ${token} does not occur in every month. Use 1st to ${MAX_ORDINAL}th`)
  }
  if (match[2] !== getOrdinalSuffix(day)) {
    fail(`"${token}" has the wrong suffix. Use "${day}${getOrdinalSuffix(day)}"`)
  }

  cursor.expect("of")
  cursor.expect("every")
  cursor.expect("month")
  const { hour, minute } = parseAt(cursor)
  return { dayOfMonth: [day], hour: [hour], minute: [minute] }
}

function parseTokens(cursor: Cursor): Partial<Fields> {
  const first = cursor.next() ?? ""

  const shortcut = SHORTCUT_SCHEDULES.get(first)
  if (shortcut) {
    cursor.expectEnd()
    return shortcut
  }

  if (first === "every") return parseEvery(cursor)
  if (first === "on") return parseDayOfMonth(cursor)

  return fail(
    `"${first}" is not a valid start of a phrase. Start with "every", "on the", or a shortcut: hourly, daily, weekly, or monthly`
  )
}

/**
 * Parse a cron phrase in the strict form.
 */
export function parseStrict(phrase: string): GrammarResult {
  if (phrase === "") return { ok: false, reason: "the phrase is empty" }
  if (phrase !== phrase.toLowerCase()) return { ok: false, reason: "use lowercase words" }

  const tokens = phrase.split(" ")
  if (tokens.includes("")) {
    return {
      ok: false,
      reason: "use one space between words, and no space at the start or the end",
    }
  }

  try {
    return { fields: createFields(parseTokens(new Cursor(tokens))), ok: true }
  } catch (error) {
    if (error instanceof GrammarError) return { ok: false, reason: error.message }
    throw error
  }
}
