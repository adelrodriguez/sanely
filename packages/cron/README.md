<div align="center">
  <h1 align="center">🗓️ <code>plaincron</code></h1>

  <p align="center">
    <strong>A small, type-safe English-like language that compiles to exact cron expressions</strong>
  </p>
</div>

Plaincron converts cron phrases such as `"every 15 minutes"` to cron expressions such as `"*/15 * * * *"`. It is not a free-text parser. It accepts a closed set of sentence shapes, and each valid cron phrase maps to exactly one cron expression.

- **Exact or throw.** The language contains only phrases that one standard cron expression can express exactly. `"every 7 minutes"` is an error, because `*/7` runs at :56 and then at :00.
- **Type-safe.** An invalid string literal is a type error, with a reason that names the failed part.
- **Small.** No runtime dependencies, no side effects, ESM only, Node 20 and later.

```ts
import { cron } from "@sanely/cron"

cron("every 15 minutes") // "*/15 * * * *"
cron("every weekday at 17:30") // "30 17 * * 1-5"
cron("every 15 minutes between 9:00 and 17:00 on weekdays") // "*/15 9-16 * * 1-5"

cron("every 7 minutes")
//     ^ Type error: "7 does not divide 60. Use 2, 3, 4, 5, 6, 10, 12, 15, 20, or 30"
```

## Install

```sh
npm install @sanely/cron
```

## The language

A cron phrase has one of these sentence shapes. Clauses in brackets are optional. The clauses must be in this order.

| Shape            | Strict form                                                    |
| ---------------- | -------------------------------------------------------------- |
| Minute interval  | `every <N> minutes [between <time> and <time>] [on <day set>]` |
| Hour interval    | `every <N> hours [on <day set>]`                               |
| Daily            | `every day at <time>`                                          |
| Days of the week | `every <day set> at <time>`                                    |
| Day of the month | `on the <ordinal> of every month at <time>`                    |
| Shortcut         | `hourly`, `daily`, `weekly`, `monthly`                         |

### Slots

| Slot              | Values                                                                               |
| ----------------- | ------------------------------------------------------------------------------------ |
| Minute interval N | 2, 3, 4, 5, 6, 10, 12, 15, 20, 30 (the divisors of 60). For 1, write `every minute`. |
| Hour interval N   | 2, 3, 4, 6, 8, 12 (the divisors of 24). For 1, write `every hour`.                   |
| Time              | `9:30` or `09:30` (24-hour), `9:30am` or `9:30pm`, `noon`, `midnight`                |
| Day set           | A day name, a list of day names, or a day group                                      |
| Ordinal           | `1st` to `28th`                                                                      |

- **Times.** A time always has minutes. `at 9` is not valid, because it can be 09:00 or 21:00. `12:00am` and `12:00pm` are not valid: write `midnight` or `noon`.
- **Day names.** Write the days in calendar order, Monday first, with the list format `monday, wednesday and friday`.
- **Day groups.** After `every`, write `weekday` (Monday to Friday) or `weekend` (Saturday and Sunday). After `on`, write `weekdays` or `weekends`.
- **Windows.** The window start and end must be on the hour. The end is not included: `between 9:00 and 17:00` runs until 16:45 for a 15-minute interval, and not at 17:00. An end at `midnight` is the end of the day.
- **Phase.** A minute interval starts at :00 of each hour. An hour interval starts at 00:00 of each day.
- **Ordinals.** Days 29 to 31 are not valid, because they do not occur in every month.

### Examples

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
| `every monday and friday at 12:00`                         | `0 12 * * 1,5`       |
| `every monday, wednesday and friday at 8:00`               | `0 8 * * 1,3,5`      |
| `on the 1st of every month at 8:00`                        | `0 8 1 * *`          |
| `on the 15th of every month at midnight`                   | `0 0 15 * *`         |
| `hourly`                                                   | `0 * * * *`          |
| `daily`                                                    | `0 0 * * *`          |
| `weekly` (Sunday, the same as `@weekly`)                   | `0 0 * * 0`          |
| `monthly`                                                  | `0 0 1 * *`          |

These phrases are not valid:

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

### Wall-clock time

Schedules are exact in wall-clock time, not in elapsed time. On a day when daylight saving time starts or stops, the time between two runs can change. A cron phrase has no time zone: the scheduler sets the time zone.

## Strict form and lenient form

The `CronPhrase` type accepts the **strict form**: lowercase words, one space between words, and only the canonical words of the tables above.

`parse` and `safeParse` also accept the **lenient form**. The lenient form is the strict form with small spelling changes. It never adds words or sentence shapes, and each lenient phrase has the same meaning as exactly one strict phrase.

| Change                | Example                                                                     |
| --------------------- | --------------------------------------------------------------------------- |
| Case                  | `Every Monday At 9:30`, `EVERY 15 MINUTES`                                  |
| Whitespace            | `"  every   15 minutes "`, tabs, and new lines                              |
| Unit aliases          | `min`, `mins`, `m`, `minute` · `hr`, `hrs`, `h`, `hour`                     |
| A unit after a number | `every 15m`, `every 2h`                                                     |
| Day aliases           | `mon`, `tue`, `tues`, `wed`, `thu`, `thurs`, `fri`, `sat`, `sun`, `mondays` |
| Day groups            | `every weekdays`, `on weekend`                                              |
| Lists                 | `mon,wed,fri` spacing, and a comma before `and`                             |
| Times                 | `9:30 PM`, `9:30PM`                                                         |

The unit aliases mean the same units as in [Humanspan](https://github.com/adelrodriguez/humanspan): `m` is minutes, and `mo` (months) is not an interval unit.

## API

Plaincron has the same API shape as Humanspan:

| Use                                            | Plaincron           | Humanspan               |
| ---------------------------------------------- | ------------------- | ----------------------- |
| A typed phrase in your code                    | `cron(phrase)`      | `ms(value)`             |
| A `string` from a config file or a form        | `parse(value)`      | `parse(value)`          |
| The same, without an error                     | `safeParse(value)`  | `safeParse(value)`      |
| Narrow a `string` to the strict type           | `isCronPhrase`      | `isTimeExpression`      |
| Check a `string` in the strict or lenient form | `isValidCronPhrase` | `isValidTimeExpression` |

### `cron(phrase)`

Converts a `CronPhrase` to a standard 5-field cron expression. An invalid string literal is a type error that names the failed part. A plain `string` is also a type error: use `parse`, or narrow the string with `isCronPhrase` first.

```ts
cron("every 2 hours") // "0 */2 * * *"
cron("every day at 9:30pm") // "30 21 * * *"

cron("every day at 9") // Type error: "9" is not a valid time. Write the minutes, such as "9:00", ...
cron(process.env.SCHEDULE) // Type error: a string is not a CronPhrase
```

### `parse(value)`

Converts a `string` in the strict or lenient form to a standard 5-field cron expression. Throws `InvalidCronPhraseError` for an invalid phrase.

```ts
parse("every 2 hours") // "0 */2 * * *"
parse("Every Mon At 9:30 AM") // "30 9 * * 1"
parse("every 7 minutes") // throws InvalidCronPhraseError
```

### `safeParse(value)`

The same as `parse`, but returns `null` for an invalid phrase. It never throws.

```ts
safeParse("every 2 hours") // "0 */2 * * *"
safeParse("every 90 minutes") // null
```

### `isCronPhrase(value)`

A type guard for the strict form. It narrows a `string` to `CronPhrase`, so that `cron` accepts it.

```ts
const schedule: string = config.schedule

if (isCronPhrase(schedule)) {
  cron(schedule) // OK: schedule is a CronPhrase
}

isCronPhrase("every 15 minutes") // true
isCronPhrase("Every 15 Mins") // false (lenient form)
```

### `isValidCronPhrase(value)`

Returns `true` for each value that `parse` accepts (strict or lenient form). It does not narrow the type.

```ts
isValidCronPhrase("Every 15 Mins") // true
isValidCronPhrase("every 7 minutes") // false
```

### `InvalidCronPhraseError`

The error that `cron` and `parse` throw. The `value` property stores the input, and the message names the part of the phrase that failed.

```ts
try {
  parse(input)
} catch (error) {
  if (error instanceof InvalidCronPhraseError) {
    console.error(error.message)
    // Invalid cron phrase: 7 does not divide 60. Use 2, 3, 4, 5, 6, 10, 12, 15, 20, or 30. Received: "every 7 minutes"
  }
}
```

## Types

| Type                    | Description                                                           |
| ----------------------- | --------------------------------------------------------------------- |
| `CronPhrase`            | A cron phrase in the strict form                                      |
| `ValidateCronPhrase<T>` | `T` if it is a valid cron phrase, or a string that tells the reason   |
| `Weekday`               | A day name: `"monday"` to `"sunday"`                                  |
| `DaySet`                | A day set after `every`, such as `"weekday"` or `"monday and friday"` |
| `OnDaySet`              | A day set after `on`, such as `"weekdays"` or `"monday and friday"`   |
| `DayNameList`           | A list of day names in calendar order                                 |
| `MinuteInterval`        | `2 \| 3 \| 4 \| 5 \| 6 \| 10 \| 12 \| 15 \| 20 \| 30`                 |
| `HourInterval`          | `2 \| 3 \| 4 \| 6 \| 8 \| 12`                                         |
| `Ordinal`               | `"1st"` to `"28th"`                                                   |
| `Shortcut`              | `"hourly" \| "daily" \| "weekly" \| "monthly"`                        |

The `CronPhrase` type checks the sentence shapes, intervals, ordinals, and the day set after `every`. It does not check times, or the clauses after `on` and `between`, because these make the union too large. `cron` and `ValidateCronPhrase` check the full phrase of a string literal. Use `ValidateCronPhrase` to write your own typed functions:

```ts
import type { ValidateCronPhrase } from "@sanely/cron"

function schedule<T extends string>(phrase: ValidateCronPhrase<T>, job: () => void) {
  // ...
}

schedule("every weekday at 9:00", sendReport) // OK
schedule("every weekday at 9", sendReport) // Type error: "9" is not a valid time
```

## License

MIT
