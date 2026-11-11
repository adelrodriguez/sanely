<div align="center">
  <h1 align="center">🗓️ <code>@sanely/cron</code></h1>

  <p align="center">
    <strong>Type-safe schedules that compile to exact cron expressions</strong>
  </p>

  <p align="center">
    <a href="https://www.npmjs.com/package/@sanely/cron"><img src="https://img.shields.io/npm/v/@sanely/cron" alt="npm version"></a>
    <a href="../../LICENSE"><img src="https://img.shields.io/github/license/adelrodriguez/sanely" alt="license"></a>
  </p>
</div>

`@sanely/cron` has one model of a schedule, the `Schedule` object, and converts it to a standard 5-field cron expression. You can write a schedule in three ways, and get it back in one.

## Features

- **A cron phrase in your code**, such as `"every 15 minutes on weekdays"`. The type checker checks the phrase and gives the reason for an error.
- **A `Schedule` object in your code**, such as `{ every: "day", at: { hour: 17, minute: 30 } }`. Ordinary types check it.
- **Input at runtime**: a cron phrase in any case and spelling, or a schedule object from JSON. `parse` checks it and throws an error with the reason.
- **A phrase for display**: `describe` writes a schedule back as a cron phrase in the strict form.
- **Exact schedules.** Each schedule maps to exactly one cron expression, and the package rejects every schedule that one cron expression cannot express exactly.
- **No side effects.**
- **No external dependencies.**

## Install

```sh
npm install @sanely/cron
```

The package is ESM only and needs Node.js 20 or later.

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

- [How to validate a schedule from user input](docs/how-to/validate-user-input.md): turn a cron phrase from a form or a schedule object from JSON into a cron expression, and show the reason when it fails.
- [How to accept a cron phrase in your own function](docs/how-to/accept-a-cron-phrase.md): check a phrase argument at compile time, as `cron` does.

Reference:

- [`@sanely/cron` reference](docs/reference.md): the functions, the `Schedule` object, the cron-phrase language, the error, the constants, and the types.

Explanation:

- [About exact schedules](docs/explanation/about-exact-schedules.md): why the package rejects a schedule that one cron expression cannot express exactly.

## Contributing

Read the [architecture](docs/architecture.md), [testing guide](docs/testing.md), and root [contributor guide](../../CONTRIBUTING.md) before changing the package.

## License

MIT. See [LICENSE](../../LICENSE).
