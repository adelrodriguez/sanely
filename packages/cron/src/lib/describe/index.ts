import { HOURS_PER_DAY } from "@sanely/core/time"
import type { ByKind, CronPhrase, DaySet, Schedule, Time, Window } from "#lib/schedule/index.ts"
import type { Weekday } from "#lib/vocabulary/words.ts"
import { match } from "#lib/schedule/index.ts"
import { DAY_GROUPS, WEEKDAYS, getOrdinalSuffix } from "#lib/vocabulary/words.ts"

// The canonical spelling of a time: 24-hour, with no leading zero on the hour.
function writeTime({ hour, minute }: Time): string {
  return `${hour}:${String(minute).padStart(2, "0")}`
}

// The window end is not included, and 24 is the end of the day.
function writeWindow({ from, to }: Window): string {
  return `${from}:00 and ${to === HOURS_PER_DAY ? "midnight" : `${to}:00`}`
}

const byCalendarOrder = (a: Weekday, b: Weekday) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b)

// A day list in calendar order without duplicates, split into its first day and the rest of the
// text: "monday" and ", wednesday and friday".
function writeDayList(days: readonly [Weekday, ...Weekday[]]): [Weekday, string] {
  const [head, ...tail] = days
  const first = tail.reduce(
    (earliest, day) => (byCalendarOrder(day, earliest) < 0 ? day : earliest),
    head
  )
  const others = [...new Set(days)].filter((day) => day !== first).toSorted(byCalendarOrder)
  if (others.length === 0) return [first, ""]
  return [
    first,
    `${others
      .slice(0, -1)
      .map((day) => `, ${day}`)
      .join("")} and ${others.at(-1)}`,
  ]
}

function writeOnDays(on: DaySet): string {
  if (typeof on === "string") return on
  const [first, rest] = writeDayList(on)
  return `${first}${rest}`
}

const PHRASES = {
  day: ({ at, on }) => {
    if (on === undefined) return `every day at ${writeTime(at)}`
    if (typeof on === "string") return `every ${DAY_GROUPS[on].singular} at ${writeTime(at)}`
    const [first, rest] = writeDayList(on)
    return `every ${first}${rest} at ${writeTime(at)}`
  },
  hour: ({ interval, on }) => {
    const base = interval === undefined ? "every hour" : (`every ${interval} hours` as const)
    return on === undefined ? base : `${base} on ${writeOnDays(on)}`
  },
  minute: ({ between, interval, on }) => {
    const base = interval === undefined ? "every minute" : (`every ${interval} minutes` as const)
    const days = on === undefined ? "" : ` on ${writeOnDays(on)}`
    if (between) return `${base} between ${writeWindow(between)}${days}`
    return on === undefined ? base : `${base} on ${writeOnDays(on)}`
  },
  month: ({ at, day }) =>
    `on the ${day}${getOrdinalSuffix(day)} of every month at ${writeTime(at)}`,
} satisfies ByKind<CronPhrase>

/**
 * Write a schedule as its canonical cron phrase in the strict form. The phrase uses the long form
 * of a shortcut, 24-hour times, and the days in calendar order.
 */
export function writePhrase(schedule: Schedule): CronPhrase {
  return match(schedule, PHRASES)
}
