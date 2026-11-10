<div align="center">
  <h1 align="center">🗓️ <code>@sanely/cron</code></h1>

  <p align="center">
    <strong>Type-safe schedules that compile to exact cron expressions</strong>
  </p>
</div>

`@sanely/cron` converts a schedule to a standard 5-field cron expression, and rejects every schedule that one cron expression cannot run at exactly its times. It has one model of a schedule, the `Schedule` object, and no runtime dependencies.

## Features

- `cron` converts a cron phrase, such as `"every 15 minutes on weekdays"`, or a `Schedule` object to a cron expression.
- The type checker checks a cron phrase literal and gives the reason for an error, such as `"7 does not divide 60"`.
- `parse` checks input at runtime, either a cron phrase in any case and spelling or a schedule object from JSON. It throws `InvalidScheduleError` with the reason, and `safeParse` returns `null`.
- `describe` writes a schedule back as its canonical cron phrase, for display.
- The package is ESM only and has no side effects.

## Install

```sh
npm install @sanely/cron
```

The package needs Node.js 20 or later.

## Get started

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

## Documentation

How-to guides:

- [How to validate a schedule from user input](docs/how-to/validate-user-input.md)
- [How to accept a cron phrase in your own function](docs/how-to/accept-a-cron-phrase.md)

Reference:

- [`@sanely/cron` reference](docs/reference.md)

Explanation:

- [About exact schedules](docs/explanation/about-exact-schedules.md)

## Contributing

Read the [architecture](docs/architecture.md), [testing guide](docs/testing.md), and root [contributor guide](../../CONTRIBUTING.md) before changing the package.

## License

MIT
