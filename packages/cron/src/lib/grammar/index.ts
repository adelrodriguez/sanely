import { HOURS_PER_DAY } from "@sanely/core/time"
import type { DaySet, Schedule, ScheduleOf, Time } from "#lib/schedule/index.ts"
import type { DayGroup, Shortcut, Weekday } from "#lib/vocabulary/words.ts"
import {
  INTERVAL_CYCLES,
  fail,
  toHourInterval,
  toMinuteInterval,
  toWindow,
} from "#lib/schedule/rules.ts"
import {
  DAY_GROUP_NAMES,
  DAY_GROUPS,
  LAST_DAY_OF_MONTH,
  WEEKDAYS,
  getOrdinalSuffix,
  isDayGroup,
  isDayOfMonth,
  isHour,
  isMinute,
  isNonEmpty,
  isWeekday,
} from "#lib/vocabulary/words.ts"

const TIME_FORMATS = "Use H:MM or HH:MM (24-hour), H:MMam or H:MMpm, noon, or midnight"

const MIDNIGHT: Time = { hour: 0, minute: 0 }

// A Map, so that a lookup never finds a member of `Object.prototype`, such as "constructor". The
// `satisfies` check gives every shortcut a schedule and accepts no other key.
const SHORTCUT_SCHEDULES: ReadonlyMap<string, Schedule> = new Map(
  Object.entries({
    daily: { at: MIDNIGHT, every: "day" },
    hourly: { every: "hour" },
    monthly: { at: MIDNIGHT, day: 1, every: "month" },
    weekly: { at: MIDNIGHT, every: "day", on: ["sunday"] },
  } satisfies Record<Shortcut, Schedule>)
)

// The day group of each singular word, such as "weekdays" for "weekday".
const GROUP_BY_SINGULAR: ReadonlyMap<string, DayGroup> = new Map(
  DAY_GROUP_NAMES.map((name) => [DAY_GROUPS[name].singular, name])
)

function findDayGroup(word: string): DayGroup | undefined {
  return isDayGroup(word) ? word : GROUP_BY_SINGULAR.get(word)
}

const DAY_SET_HINT = `Use monday to sunday, ${DAY_GROUP_NAMES.map((name) => DAY_GROUPS[name].singular).join(", ")}, or ${DAY_GROUP_NAMES.join(", ")}`

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

// An interval of 1 and an interval of one full cycle have their own sentence shapes.
const INTERVAL_WORDS = {
  hours: { cycle: INTERVAL_CYCLES.hour, next: "every day at midnight", single: "every hour" },
  minutes: { cycle: INTERVAL_CYCLES.minute, next: "every hour", single: "every minute" },
} as const

function parseIntervalNumber(token: string, unit: keyof typeof INTERVAL_WORDS): number {
  if (!/^[1-9]\d*$/.test(token)) {
    fail(`"${token}" is not a valid interval. Use a whole number without a leading zero`)
  }

  const value = Number(token)
  const { cycle, next, single } = INTERVAL_WORDS[unit]
  if (value === 1) fail(`use "${single}" for an interval of 1 ${unit.slice(0, -1)}`)
  if (value === cycle) fail(`use "${next}" for an interval of ${cycle} ${unit}`)
  return value
}

function toTime(token: string, hour: number, minute: number): Time {
  if (!isHour(hour) || !isMinute(minute)) fail(`"${token}" is not a valid time. ${TIME_FORMATS}`)
  return { hour, minute }
}

function parseTimeToken(token: string): Time {
  if (token === "noon") return { hour: 12, minute: 0 }
  if (token === "midnight") return { hour: 0, minute: 0 }

  const clock = /^(\d{1,2}):([0-5]\d)$/.exec(token)
  if (clock) return toTime(token, Number(clock[1]), Number(clock[2]))

  const meridiem = /^([1-9]|1[0-2]):([0-5]\d)(am|pm)$/.exec(token)
  if (meridiem) {
    const hour = Number(meridiem[1])
    const minute = Number(meridiem[2])
    if (hour === 12 && minute === 0) {
      fail(`"${token}" is ambiguous. Use ${meridiem[3] === "am" ? "midnight" : "noon"}`)
    }
    return toTime(token, (hour % 12) + (meridiem[3] === "pm" ? 12 : 0), minute)
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

function parseTime(cursor: Cursor): Time {
  const before = cursor.before
  const token = cursor.next()
  if (token === undefined) fail(`expected a time after "${before}"`)
  return parseTimeToken(token)
}

function formatDayList(names: readonly string[]): string {
  if (names.length <= 2) return names.join(" and ")
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
}

const byCalendarOrder = (a: Weekday, b: Weekday) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b)

// The checks follow the same steps as the type-level validator, so that the reasons agree: first
// the day names, then duplicates, then the calendar order, and last the list format.
function parseDayList(words: readonly string[], before: string): readonly [Weekday, ...Weekday[]] {
  const names = words
    .filter((word) => word !== "and")
    .map((word) => (word.endsWith(",") ? word.slice(0, -1) : word))

  for (const name of names) {
    if (findDayGroup(name)) fail(`"${name}" cannot be part of a list of days`)
    if (!isWeekday(name)) fail(`"${name}" is not a day. ${DAY_SET_HINT}`)
  }

  const days = names.filter((name) => isWeekday(name))
  if (!isNonEmpty(days)) return fail(`expected a day set after "${before}"`)

  const duplicate = days.find((day, index) => days.indexOf(day) !== index)
  if (duplicate) fail(`"${duplicate}" is in the list more than one time`)

  const sorted = days.toSorted(byCalendarOrder)
  if (sorted.some((day, index) => day !== days[index])) {
    fail(`list the days in calendar order, Monday first: "${formatDayList(sorted)}"`)
  }

  if (words.join(" ") !== formatDayList(days)) fail(`write the list as "${formatDayList(days)}"`)

  return days
}

// A day set ends at the end of the phrase or at one of the stop words.
function parseDaySet(
  cursor: Cursor,
  context: "every" | "on",
  stopWords: readonly string[]
): DaySet {
  const before = cursor.before
  const words: string[] = []
  while (!cursor.done && !stopWords.includes(cursor.peek() ?? "")) words.push(cursor.next() ?? "")

  if (words.length === 0) fail(`expected a day set after "${before}"`)

  const [only = ""] = words
  const group = words.length === 1 ? findDayGroup(only) : undefined
  if (group) {
    const expected = context === "every" ? DAY_GROUPS[group].singular : group
    if (only !== expected) fail(`use "${expected}" after "${context}"`)
    return group
  }

  return parseDayList(words, before)
}

function parseOn(cursor: Cursor): { on?: DaySet } {
  if (cursor.peek() !== "on") return {}
  cursor.next()
  return { on: parseDaySet(cursor, "on", ["at", "between"]) }
}

function parseWindow(cursor: Cursor): Pick<ScheduleOf<"minute">, "between"> {
  if (cursor.peek() !== "between") return {}
  cursor.next()

  const startToken = cursor.peek() ?? ""
  const start = parseTime(cursor)
  cursor.expect("and")
  const endToken = cursor.peek() ?? ""
  const end = parseTime(cursor)

  if (start.minute !== 0) {
    fail(`the window must start and end on the hour, and "${startToken}" is not on the hour`)
  }
  if (end.minute !== 0) {
    fail(`the window must start and end on the hour, and "${endToken}" is not on the hour`)
  }

  // The end is not included. An end at midnight is the end of the day.
  return { between: toWindow(start.hour, end.hour === 0 ? HOURS_PER_DAY : end.hour) }
}

function parseMinuteInterval(
  cursor: Cursor,
  interval: Pick<ScheduleOf<"minute">, "interval">
): Schedule {
  const between = parseWindow(cursor)
  const on = parseOn(cursor)
  if (on.on && cursor.peek() === "between") {
    fail(`the window clause must come before the "on" clause`)
  }

  if (cursor.peek() === "at") {
    fail(
      `a minute interval cannot have an "at" clause. Use "between <time> and <time>" to limit it to a window`
    )
  }
  cursor.expectEnd()
  return { every: "minute", ...interval, ...between, ...on }
}

function parseHourInterval(
  cursor: Cursor,
  interval: Pick<ScheduleOf<"hour">, "interval">
): Schedule {
  if (cursor.peek() === "between") fail("an hour interval cannot have a window")

  const on = parseOn(cursor)

  if (cursor.peek() === "at") fail(`an hour interval cannot have an "at" clause`)
  if (cursor.peek() === "between") fail("an hour interval cannot have a window")
  cursor.expectEnd()
  return { every: "hour", ...interval, ...on }
}

function parseAt(cursor: Cursor): Time {
  if (cursor.done) fail(`expected "at <time>" after "${cursor.before}"`)
  cursor.expect("at")
  const time = parseTime(cursor)
  cursor.expectEnd()
  return time
}

function parseEvery(cursor: Cursor): Schedule {
  const token = cursor.peek()
  if (token === undefined) fail(`expected an interval, "day", or a day set after "every"`)

  if (token === "minute" || token === "hour") {
    cursor.next()
    return token === "minute" ? parseMinuteInterval(cursor, {}) : parseHourInterval(cursor, {})
  }

  if (token === "minutes" || token === "hours") {
    fail(`use "every ${token.slice(0, -1)}", or write a number before "${token}"`)
  }

  if (token === "day") {
    cursor.next()
    return { at: parseAt(cursor), every: "day" }
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

    const value = parseIntervalNumber(token, unit)
    return unit === "minutes"
      ? parseMinuteInterval(cursor, { interval: toMinuteInterval(value) })
      : parseHourInterval(cursor, { interval: toHourInterval(value) })
  }

  const on = parseDaySet(cursor, "every", ["at"])
  return { at: parseAt(cursor), every: "day", on }
}

function parseDayOfMonth(cursor: Cursor): Schedule {
  cursor.expect("the")

  const token = cursor.next()
  if (token === undefined) fail(`expected a day of the month after "on the"`)

  const match = /^([1-9]\d*)(st|nd|rd|th)$/.exec(token)
  const day = Number(match?.[1])
  if (!match || day > 31) {
    fail(`"${token}" is not a day of the month. Use 1st to ${LAST_DAY_OF_MONTH}th`)
  }
  if (!isDayOfMonth(day)) {
    return fail(`the ${token} does not occur in every month. Use 1st to ${LAST_DAY_OF_MONTH}th`)
  }
  if (match[2] !== getOrdinalSuffix(day)) {
    fail(`"${token}" has the wrong suffix. Use "${day}${getOrdinalSuffix(day)}"`)
  }

  cursor.expect("of")
  cursor.expect("every")
  cursor.expect("month")
  return { at: parseAt(cursor), day, every: "month" }
}

function parseTokens(cursor: Cursor): Schedule {
  const first = cursor.next() ?? ""

  const shortcut = SHORTCUT_SCHEDULES.get(first)
  if (shortcut) {
    cursor.expectEnd()
    // A copy, so that a caller who changes the result does not change the table.
    return structuredClone(shortcut)
  }

  if (first === "every") return parseEvery(cursor)
  if (first === "on") return parseDayOfMonth(cursor)

  return fail(
    `"${first}" is not a valid start of a phrase. Start with "every", "on the", or a shortcut: hourly, daily, weekly, or monthly`
  )
}

/**
 * Parse a cron phrase in the strict form.
 *
 * @throws {ParseError} With a reason that names the part of the phrase that failed
 */
export function parsePhrase(phrase: string): Schedule {
  if (phrase === "") fail("the phrase is empty")
  if (phrase !== phrase.toLowerCase()) fail("use lowercase words")

  const tokens = phrase.split(" ")
  if (tokens.includes("")) fail("use one space between words, and no space at the start or the end")

  return parseTokens(new Cursor(tokens))
}
