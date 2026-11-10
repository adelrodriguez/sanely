<div align="center">
  <h1 align="center">🗓️ <code>@sanely/cron</code></h1>

  <p align="center">
    <strong>Type-safe schedules that compile to exact cron expressions</strong>
  </p>
</div>

`@sanely/cron` has one model of a schedule, the `Schedule` object, and converts it to a standard 5-field cron expression. You can write a schedule in three ways, and get it back in one:

- **A cron phrase in your code**, such as `"every 15 minutes on weekdays"`. The type checker checks the phrase and gives the reason for an error.
- **A `Schedule` object in your code**, such as `{ every: "day", at: { hour: 17, minute: 30 } }`. Ordinary types check it.
- **Input at runtime**: a cron phrase in any case and spelling, or a schedule object from JSON. `parse` checks it and throws an error with the reason.
- **A phrase for display**: `describe` writes a schedule back as its canonical cron phrase.

Each schedule maps to exactly one cron expression, and the package rejects every schedule that one cron expression cannot express exactly. It has no runtime dependencies and no side effects. It is ESM only, for Node 20 and later.

```ts
import { cron, describe, parse } from "@sanely/cron"

cron("every 15 minutes between 9:00 and 17:00 on weekdays") // "*/15 9-16 * * 1-5"
cron({ every: "day", at: { hour: 17, minute: 30 }, on: ["monday", "friday"] }) // "30 17 * * 1,5"

cron("every 7 minutes")
//   ^ Type error: "7 does not divide 60. Use 2, 3, 4, 5, 6, 10, 12, 15, 20, or 30"

const schedule = parse(form.schedule) // a Schedule, or throws InvalidScheduleError
queue.upsertJobScheduler(id, { pattern: cron(schedule) })

describe(schedule) // "every 15 minutes between 9:00 and 17:00 on weekdays"
```

## Install

```sh
npm install @sanely/cron
```

## Schedules are exact or rejected

A schedule is valid only when one standard 5-field cron expression runs at exactly its times. `@sanely/cron` never gives an expression that runs at other times.

- **Intervals divide the next larger unit.** A minute interval divides 60, and an hour interval divides 24. `*/7` in the minute field runs at :56 and then at :00 of the next hour, so `every 7 minutes` is an error.
- **Intervals start at the start of the cycle.** A minute interval starts at :00 of each hour. An hour interval starts at 00:00 of each day.
- **Windows are on whole hours, and the end is not included.** `between 9:00 and 17:00` runs from 9:00 to 16:59. An end at midnight is the end of the day.
- **Days of the month are 1 to 28.** Days 29 to 31 do not occur in every month.
- **A month schedule has no day set.** When cron has both a day of the month and a day of the week, it runs on a day that matches either one.

Schedules are exact in wall-clock time, not in elapsed time. On a day when daylight saving time starts or stops, the time between two runs can change. A schedule has no time zone: the scheduler sets the time zone.

## Documentation

Reference:

- [`@sanely/cron` reference](docs/reference.md): the functions, the `Schedule` object, the cron-phrase language, the error, the constants, and the types.

## Contributing

Read the [architecture](docs/architecture.md), [testing guide](docs/testing.md), and root [contributor guide](../../CONTRIBUTING.md) before changing the package.

## License

MIT
