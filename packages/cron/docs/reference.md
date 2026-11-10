# `@sanely/cron` reference

The package has one entry point, `@sanely/cron`. Every export is a named export.

## The `Schedule` object

A `Schedule` is one of four kinds. The `every` key selects the kind.

| Kind              | Keys                           | Example                                                                           | Cron expression     |
| ----------------- | ------------------------------ | --------------------------------------------------------------------------------- | ------------------- |
| `every: "minute"` | `interval?`, `between?`, `on?` | `{ every: "minute", interval: 15, between: { from: 9, to: 17 }, on: "weekdays" }` | `*/15 9-16 * * 1-5` |
| `every: "hour"`   | `interval?`, `on?`             | `{ every: "hour", interval: 6, on: "weekends" }`                                  | `0 */6 * * 0,6`     |
| `every: "day"`    | `at`, `on?`                    | `{ every: "day", at: { hour: 17, minute: 30 }, on: ["monday", "friday"] }`        | `30 17 * * 1,5`     |
| `every: "month"`  | `day`, `at`                    | `{ every: "month", day: 15, at: { hour: 0, minute: 0 } }`                         | `0 0 15 * *`        |

The keys take these values:

| Key        | Type             | Values                                                                                                 |
| ---------- | ---------------- | ------------------------------------------------------------------------------------------------------ |
| `interval` | `MinuteInterval` | `2`, `3`, `4`, `5`, `6`, `10`, `12`, `15`, `20`, `30`. Leave out `interval` to run every minute.       |
| `interval` | `HourInterval`   | `2`, `3`, `4`, `6`, `8`, `12`. Leave out `interval` to run every hour.                                 |
| `between`  | `Window`         | `{ from, to }` on whole hours. `from` is `0` to `23`, and `to` is after `from`, up to `24` (midnight). |
| `on`       | `DaySet`         | `"weekdays"` (Monday to Friday), `"weekends"`, or a list of one or more `Weekday` names.               |
| `at`       | `Time`           | `{ hour, minute }`. `hour` is `0` to `23`, and `minute` is `0` to `59`.                                |
| `day`      | `DayOfMonth`     | `1` to `28`.                                                                                           |

The schedule rules are:

- A minute interval starts at :00 of each hour. An hour interval starts at 00:00 of each day.
- A window includes its start and excludes its end. `between: { from: 9, to: 17 }` runs from 9:00 to 16:59.
- An optional key set to `undefined` is the same as a missing key.
- A list of days is a set. The order and duplicates do not change the schedule. `describe` writes the days in calendar order, Monday first.

[About exact schedules](explanation/about-exact-schedules.md) gives the reasons for these limits.

## The cron-phrase language

A cron phrase has one of these sentence shapes. Clauses in brackets are optional, and the clauses must be in this order.

| Shape            | Strict form                                                    | Schedule          |
| ---------------- | -------------------------------------------------------------- | ----------------- |
| Minute interval  | `every <N> minutes [between <time> and <time>] [on <day set>]` | `every: "minute"` |
| Hour interval    | `every <N> hours [on <day set>]`                               | `every: "hour"`   |
| Daily            | `every day at <time>`                                          | `every: "day"`    |
| Days of the week | `every <day set> at <time>`                                    | `every: "day"`    |
| Day of the month | `on the <ordinal> of every month at <time>`                    | `every: "month"`  |
| Shortcut         | `hourly`, `daily`, `weekly`, `monthly`                         | See below         |

The slots take these values:

| Slot              | Values                                                                |
| ----------------- | --------------------------------------------------------------------- |
| Minute interval N | 2, 3, 4, 5, 6, 10, 12, 15, 20, 30. For 1, write `every minute`.       |
| Hour interval N   | 2, 3, 4, 6, 8, 12. For 1, write `every hour`.                         |
| Time              | `9:30` or `09:30` (24-hour), `9:30am` or `9:30pm`, `noon`, `midnight` |
| Day set           | A day name, a list of day names, or a day group                       |
| Ordinal           | `1st` to `28th`                                                       |

The slots follow these rules:

- **Times.** A time always has minutes. `at 9` is not valid, because it can be 09:00 or 21:00. `12:00am` and `12:00pm` are not valid. Write `midnight` or `noon`.
- **Day names.** Write the days in calendar order, Monday first, with the list format `monday, wednesday and friday`.
- **Day groups.** After `every`, write `weekday` (Monday to Friday) or `weekend` (Saturday and Sunday). After `on`, write `weekdays` or `weekends`.
- **Shortcuts.** `hourly` is `every hour`, `daily` is `every day at 0:00`, `weekly` is `every sunday at 0:00`, and `monthly` is `on the 1st of every month at 0:00`.

### Valid cron phrases

| Cron phrase                                                | Cron expression      |
| ---------------------------------------------------------- | -------------------- |
| `every minute`                                             | `* * * * *`          |
| `every 15 minutes`                                         | `*/15 * * * *`       |
| `every 15 minutes on weekdays`                             | `*/15 * * * 1-5`     |
| `every 15 minutes between 9:00 and 17:00`                  | `*/15 9-16 * * *`    |
| `every 10 minutes between 6:00pm and midnight on weekends` | `*/10 18-23 * * 0,6` |
| `every hour`                                               | `0 * * * *`          |
| `every 2 hours`                                            | `0 */2 * * *`        |
| `every 6 hours on monday and friday`                       | `0 */6 * * 1,5`      |
| `every day at 9:30`                                        | `30 9 * * *`         |
| `every day at 9:30pm`                                      | `30 21 * * *`        |
| `every weekday at 17:30`                                   | `30 17 * * 1-5`      |
| `every weekend at noon`                                    | `0 12 * * 0,6`       |
| `every monday, wednesday and friday at 8:00`               | `0 8 * * 1,3,5`      |
| `on the 1st of every month at 8:00`                        | `0 8 1 * *`          |
| `hourly`                                                   | `0 * * * *`          |
| `daily`                                                    | `0 0 * * *`          |
| `weekly`                                                   | `0 0 * * 0`          |
| `monthly`                                                  | `0 0 1 * *`          |

### Invalid cron phrases

| Cron phrase                          | Reason                                       |
| ------------------------------------ | -------------------------------------------- |
| `every 7 minutes`                    | 7 does not divide 60                         |
| `every 90 minutes`                   | 90 minutes has no exact single cron          |
| `every 5 hours`                      | 5 does not divide 24                         |
| `every day at 9`                     | The time has no minutes                      |
| `every friday and monday at 9:00`    | The days are not in calendar order           |
| `every 15 minutes at 9:30`           | A minute interval cannot have an `at` clause |
| `on the 31st of every month at 9:00` | The 31st does not occur in every month       |
| `biweekly`, `twice a day`            | These words are not in the language          |

### Strict form

`cron` accepts the strict form in a string literal. The strict form has lowercase words, one space between words, and only the words of the tables above. `describe` writes the strict form.

### Lenient form

`parse` and `safeParse` also accept the lenient form, which is the strict form with these spelling changes. The lenient form never adds words or sentence shapes, and each lenient phrase has the same meaning as exactly one strict phrase.

| Change                | Example                                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------------------- |
| Case                  | `Every Monday At 9:30`, `EVERY 15 MINUTES`                                                                      |
| Whitespace            | `"  every   15 minutes "`, tabs, and new lines                                                                  |
| Unit aliases          | `min`, `mins`, `m`, `minute`, and `hr`, `hrs`, `h`, `hour`                                                      |
| A unit after a number | `every 15m`, `every 2h`                                                                                         |
| Day aliases           | `mon`, `tue`, `tues`, `wed`, `weds`, `thu`, `thur`, `thurs`, `fri`, `sat`, `sun`, and plurals such as `mondays` |
| Day groups            | `every weekdays`, `on weekend`                                                                                  |
| Lists                 | Any spacing around a comma, such as `mon,wed and fri`, and a comma before `and`                                 |
| Times                 | `9:30 PM`, `9:30PM`                                                                                             |

The unit aliases mean the same units as in [`@sanely/duration`](../../duration). `m` is minutes, and `mo` (months) is not an interval unit.

## Functions

### `cron`

```ts
function cron<const T extends string | Schedule>(
  input: T extends string ? ValidateCronPhrase<T> : Schedule
): CronExpression
```

Converts a schedule to a standard 5-field cron expression. The input is a `Schedule` object, or a cron phrase in a string literal in the strict form.

```ts
cron("every 2 hours") // "0 */2 * * *"
cron({ every: "minute", interval: 10, between: { from: 18, to: 24 } }) // "*/10 18-23 * * *"
cron(parse(input)) // a Schedule from parse
```

An invalid phrase literal is a type error that gives the reason. An invalid object is a type error on the key that fails. A plain `string` is a type error. Use `parse` for a string at runtime.

```ts
cron("every day at 9")
// Argument of type '"every day at 9"' is not assignable to parameter of type
// '"\"9\" is not a valid time. Write the minutes, such as \"9:00\", and use 24-hour time or am/pm"'.

cron({ every: "minute", interval: 7 })
// Type '7' is not assignable to type '2 | 3 | 4 | 5 | 6 | 10 | 12 | 15 | 20 | 30 | undefined'.

cron(input) // input: string
// Argument of type 'string' is not assignable to parameter of type
// '"a string is not a CronPhrase. Use parse for a string at runtime"'.
```

`cron` also checks its input at runtime. It throws `InvalidScheduleError` for an invalid input from JavaScript or a cast.

### `parse`

```ts
function parse(value: unknown): Schedule
```

Parses input at runtime to a `Schedule`. A string is a cron phrase in the strict form or the lenient form. An object is a schedule object, such as one from `JSON.parse`. Each key must be a key of its kind of schedule. Throws `InvalidScheduleError` for an invalid value.

```ts
parse("Every 15 Mins Between 9:00 AM And 5:00 PM On Weekdays")
// { every: "minute", interval: 15, between: { from: 9, to: 17 }, on: "weekdays" }

parse(JSON.parse('{"every":"day","at":{"hour":9,"minute":30}}'))
// { every: "day", at: { hour: 9, minute: 30 } }

parse({ every: "day", at: { hour: 25, minute: 0 } })
// throws InvalidScheduleError: Invalid schedule at "at.hour": 25 is not an hour. Use 0 to 23. Received: {"every":"day","at":{"hour":25,"minute":0}}
```

### `safeParse`

```ts
function safeParse(value: unknown): Schedule | null
```

The same as `parse`, but returns `null` for an invalid value.

```ts
safeParse("every 2 hours") // { every: "hour", interval: 2 }
safeParse("every 90 minutes") // null
```

### `describe`

```ts
function describe(schedule: Schedule): CronPhrase
```

Writes a schedule as its canonical cron phrase in the strict form, for display. The phrase uses 24-hour times, the days in calendar order, and the long form of a shortcut. `parse` of the phrase gives the same schedule in canonical form. The result is a `CronPhrase`, so `cron` accepts it. Throws `InvalidScheduleError` for an invalid schedule from JavaScript or a cast.

```ts
describe({ every: "day", at: { hour: 8, minute: 0 }, on: ["friday", "monday", "wednesday"] })
// "every monday, wednesday and friday at 8:00"

describe(parse("weekly")) // "every sunday at 0:00"
```

### `isSchedule`

```ts
function isSchedule(value: unknown): value is Schedule
```

A type guard for a schedule object. It returns `true` when `parse` accepts the value as an object. A cron phrase is not a schedule object.

```ts
isSchedule({ every: "hour" }) // true
isSchedule({ every: "minute", interval: 7 }) // false
isSchedule("every hour") // false
```

## `InvalidScheduleError`

The error that `cron`, `parse`, and `describe` throw. It has these properties:

| Property | Type                            | Value                                                                                                                                        |
| -------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`   | `"InvalidScheduleError"`        | The error name                                                                                                                               |
| `value`  | `unknown`                       | The input, without a change                                                                                                                  |
| `reason` | `string`                        | Why the input is not valid. For a cron phrase, the same text as the type error                                                               |
| `path`   | `readonly (string \| number)[]` | The keys to the value that failed in a schedule object, such as `["at", "hour"]`. Empty for a phrase and for an object that fails as a whole |

The `message` is `Invalid schedule`, then ` at "<path>"` when the path is not empty, then the reason and the received value.

```ts
try {
  parse({ every: "minute", interval: 7 })
} catch (error) {
  if (error instanceof InvalidScheduleError) {
    error.reason // "7 does not divide 60. Use 2, 3, 4, 5, 6, 10, 12, 15, 20, or 30"
    error.path // ["interval"]
  }
}
```

## Constants

| Constant           | Value                                                                            |
| ------------------ | -------------------------------------------------------------------------------- |
| `MINUTE_INTERVALS` | `[2, 3, 4, 5, 6, 10, 12, 15, 20, 30]`                                            |
| `HOUR_INTERVALS`   | `[2, 3, 4, 6, 8, 12]`                                                            |
| `WEEKDAYS`         | `["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]` |

Each constant is an `as const` tuple, and the type of the same name derives from it.

```ts
MINUTE_INTERVALS.includes(15) // true
```

## Types

| Type                    | Description                                                          |
| ----------------------- | -------------------------------------------------------------------- |
| `Schedule`              | A schedule object of one of the four kinds                           |
| `CronExpression`        | A cron expression that `cron` made. It is a `string`                 |
| `CronPhrase`            | A cron phrase in the strict form, such as the result of `describe`   |
| `ValidateCronPhrase<T>` | `T` if it is a valid cron phrase, or a string that gives the reason  |
| `MinuteInterval`        | One of `MINUTE_INTERVALS`                                            |
| `HourInterval`          | One of `HOUR_INTERVALS`                                              |
| `Weekday`               | One of `WEEKDAYS`                                                    |
| `DaySet`                | `"weekdays"`, `"weekends"`, or a list of one or more `Weekday` names |
| `Time`                  | `{ hour, minute }` on the 24-hour clock                              |
| `Window`                | `{ from, to }` on whole hours, with `to` after `from`                |
| `DayOfMonth`            | `1` to `28`                                                          |

The `CronPhrase` type checks the sentence shape, the intervals, and the first word of each slot. The rest of each slot is open. `cron` and `ValidateCronPhrase` check the full phrase of a string literal.

```ts
import type { ValidateCronPhrase } from "@sanely/cron"

type Valid = ValidateCronPhrase<"every weekday at 9:00"> // "every weekday at 9:00"
type Invalid = ValidateCronPhrase<"every 5 hours"> // "5 does not divide 24. Use 2, 3, 4, 6, 8, or 12"
```

To accept a cron phrase in your own function, see [How to accept a cron phrase in your own function](how-to/accept-a-cron-phrase.md).
