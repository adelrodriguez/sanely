import type { DaySet, Kind, Schedule, ScheduleOf, Time, Window } from "#lib/schedule/index.ts"
import type { Path } from "#lib/schedule/rules.ts"
import type { DayOfMonth, HourInterval, MinuteInterval, Weekday } from "#lib/vocabulary/words.ts"
import { fail, show, toHourInterval, toMinuteInterval, toWindow } from "#lib/schedule/rules.ts"
import {
  DAY_GROUP_NAMES,
  HOURS_PER_DAY,
  LAST_DAY_OF_MONTH,
  MINUTES_PER_HOUR,
  formatChoices,
  isDayGroup,
  isDayOfMonth,
  isHour,
  isMinute,
  isNonEmpty,
  isWeekday,
  isWindowEnd,
} from "#lib/vocabulary/words.ts"

type JsonObject = Readonly<Record<string, unknown>>

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

// An own value only, so that a key on the prototype, such as "constructor", is never read.
function getOwn(object: JsonObject, key: string): unknown {
  return Object.hasOwn(object, key) ? object[key] : undefined
}

// An object with only the given keys.
function readObject(value: unknown, path: Path, name: string, keys: readonly string[]): JsonObject {
  const list = keys.map((key) => JSON.stringify(key)).join(", ")
  if (!isObject(value)) fail(`${show(value)} is not ${name}. Use an object with ${list}`, path)

  const unknownKey = Object.keys(value).find((key) => !keys.includes(key))
  if (unknownKey !== undefined) {
    fail(`"${unknownKey}" is not a key of ${name}. Use ${list}`, [...path, unknownKey])
  }
  return value
}

type Read<T> = (value: unknown, path: Path) => T

// A key that the type does not mark optional. `undefined` is the same as a missing key.
function readRequired<T>(object: JsonObject, path: Path, key: string, read: Read<T>): T {
  const value = getOwn(object, key)
  if (value === undefined) fail(`the key "${key}" is required`, [...path, key])
  return read(value, [...path, key])
}

// A key that the type marks optional. The result has no key when the value is missing.
function readOptional<R extends object>(
  object: JsonObject,
  key: string,
  read: (value: unknown, path: Path) => R
): Partial<R> {
  const value = getOwn(object, key)
  return value === undefined ? {} : read(value, [key])
}

function readHour(value: unknown, path: Path): Time["hour"] {
  if (!isHour(value)) fail(`${show(value)} is not an hour. Use 0 to ${HOURS_PER_DAY - 1}`, path)
  return value
}

function readMinute(value: unknown, path: Path): Time["minute"] {
  if (!isMinute(value)) {
    fail(`${show(value)} is not a minute. Use 0 to ${MINUTES_PER_HOUR - 1}`, path)
  }
  return value
}

function readTime(value: unknown, path: Path): Time {
  const object = readObject(value, path, "a time", ["hour", "minute"])
  return {
    hour: readRequired(object, path, "hour", readHour),
    minute: readRequired(object, path, "minute", readMinute),
  }
}

function readWindowEnd(value: unknown, path: Path): Window["to"] {
  if (!isWindowEnd(value)) {
    fail(`${show(value)} is not a window end. Use 1 to ${HOURS_PER_DAY}`, path)
  }
  return value
}

function readWindow(value: unknown, path: Path): Window {
  const object = readObject(value, path, "a window", ["from", "to"])
  const from = readRequired(object, path, "from", readHour)
  const to = readRequired(object, path, "to", readWindowEnd)
  return toWindow(from, to, path)
}

const DAY_SET_HINT = `Use ${formatChoices([...DAY_GROUP_NAMES.map((name) => JSON.stringify(name)), "a list of day names"])}`

function readDaySet(value: unknown, path: Path): DaySet {
  if (isDayGroup(value)) return value
  if (!Array.isArray(value)) return fail(`${show(value)} is not a day set. ${DAY_SET_HINT}`, path)

  const list: readonly unknown[] = value
  for (const [index, day] of list.entries()) {
    if (!isWeekday(day)) fail(`${show(day)} is not a day. Use monday to sunday`, [...path, index])
  }

  const days: Weekday[] = list.filter((day) => isWeekday(day))
  if (!isNonEmpty(days)) return fail("the list of days is empty. Use one or more day names", path)
  return days
}

// An interval of 1 is the schedule without `interval`, and an interval of one full cycle is the
// next kind of schedule.
function readIntervalNumber(value: unknown, path: Path, unit: string, next: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    fail(`${show(value)} is not a valid interval. Use a whole number`, path)
  }
  if (value === 1) fail(`leave out "interval" for an interval of 1 ${unit}`, path)
  if (value === (unit === "minute" ? MINUTES_PER_HOUR : HOURS_PER_DAY)) {
    fail(`use ${next} for an interval of ${value} ${unit}s`, path)
  }
  return value
}

function readMinuteInterval(value: unknown, path: Path): MinuteInterval {
  return toMinuteInterval(readIntervalNumber(value, path, "minute", `"every": "hour"`), path)
}

function readHourInterval(value: unknown, path: Path): HourInterval {
  return toHourInterval(readIntervalNumber(value, path, "hour", `"every": "day" at midnight`), path)
}

function readDayOfMonth(value: unknown, path: Path): DayOfMonth {
  if (isDayOfMonth(value)) return value
  const range = `Use 1 to ${LAST_DAY_OF_MONTH}`
  if (
    typeof value === "number"
    && Number.isInteger(value)
    && value > LAST_DAY_OF_MONTH
    && value <= 31
  ) {
    return fail(`day ${value} does not occur in every month. ${range}`, path)
  }
  return fail(`${show(value)} is not a day of the month. ${range}`, path)
}

// The keys of each kind of schedule, without `every`, and how to read them.
const SHAPES = {
  day: {
    keys: ["at", "on"],
    name: "a day schedule",
    read: (object) => ({
      at: readRequired(object, [], "at", readTime),
      every: "day",
      ...readOptional(object, "on", (value, path) => ({ on: readDaySet(value, path) })),
    }),
  },
  hour: {
    keys: ["interval", "on"],
    name: "an hour schedule",
    read: (object) => ({
      every: "hour",
      ...readOptional(object, "interval", (value, path) => ({
        interval: readHourInterval(value, path),
      })),
      ...readOptional(object, "on", (value, path) => ({ on: readDaySet(value, path) })),
    }),
  },
  minute: {
    keys: ["between", "interval", "on"],
    name: "a minute schedule",
    read: (object) => ({
      every: "minute",
      ...readOptional(object, "between", (value, path) => ({ between: readWindow(value, path) })),
      ...readOptional(object, "interval", (value, path) => ({
        interval: readMinuteInterval(value, path),
      })),
      ...readOptional(object, "on", (value, path) => ({ on: readDaySet(value, path) })),
    }),
  },
  month: {
    keys: ["at", "day"],
    name: "a month schedule",
    read: (object) => ({
      at: readRequired(object, [], "at", readTime),
      day: readRequired(object, [], "day", readDayOfMonth),
      every: "month",
    }),
  },
} satisfies {
  readonly [K in Kind]: {
    readonly name: string
    readonly keys: ReadonlyArray<Exclude<keyof ScheduleOf<K>, "every">>
    readonly read: (object: JsonObject) => ScheduleOf<K>
  }
}

// A Map, so that an `every` value such as "constructor" finds no shape.
const SHAPE_BY_KIND: ReadonlyMap<
  string,
  {
    readonly keys: readonly string[]
    readonly name: string
    readonly read: (object: JsonObject) => Schedule
  }
> = new Map(Object.entries(SHAPES))

const KIND_CHOICES = formatChoices(Object.keys(SHAPES).map((kind) => JSON.stringify(kind)))

/**
 * Read a schedule object, such as one from `JSON.parse`, key by key. A key that the kind of
 * schedule does not have is an error.
 *
 * @throws {ParseError} With the reason and the path of the key that failed
 */
export function validate(value: unknown): Schedule {
  if (!isObject(value)) fail(`${show(value)} is not a schedule object`)

  const every = getOwn(value, "every")
  if (every === undefined) fail(`the key "every" is required. Use ${KIND_CHOICES}`, ["every"])

  const shape = typeof every === "string" ? SHAPE_BY_KIND.get(every) : undefined
  if (!shape)
    return fail(`${show(every)} is not a kind of schedule. Use ${KIND_CHOICES}`, ["every"])

  readObject(value, [], shape.name, ["every", ...shape.keys])
  return shape.read(value)
}
