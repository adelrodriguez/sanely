<div align="center">
  <h1 align="center">⏱️ <code>@sanely/duration</code></h1>

  <p align="center">
    <strong>Parsing and formatting for human-readable time expressions</strong>
  </p>

  <p align="center">
    <a href="https://www.npmjs.com/package/@sanely/duration"><img src="https://img.shields.io/npm/v/@sanely/duration" alt="npm version"></a>
    <a href="../../LICENSE"><img src="https://img.shields.io/github/license/adelrodriguez/sanely" alt="license"></a>
  </p>
</div>

`@sanely/duration` is a TypeScript package for time expressions, with no external dependencies. It converts `"1h"` to seconds, parses `"1h 30m"` to milliseconds, and formats `5_400_000` as `"1h 30m"`.

## Features

- Unit functions convert one time expression, such as `seconds("1h")` and `days("1w")`.
- `convert("1h 30m", "minutes")` converts a compound time expression to a named unit.
- `parse` converts a compound time expression to milliseconds.
- `format` writes milliseconds as a short-form or long-form time expression.
- The unit functions check string literals at compile time, and give the reason for an invalid one.
- Each result is a `Duration` in its unit, so `format(seconds("1h"))` is a type error.
- `isTimeExpression` and `isValidTimeExpression` check values at run time.
- Invalid input throws `InvalidTimeExpressionError`, or `safeParse` returns `null`.
- Every export is a named export that a bundler can remove when you do not use it.

## Install

```bash
npm install @sanely/duration
```

The package needs Node.js 20 or later.

## Get started

```ts
import { convert, format, ms, parse, seconds } from "@sanely/duration"

seconds("1h") // 3600
ms("30s") // 30_000
convert("1h 30m", "minutes") // 90
parse("1h 30m") // 5_400_000
format(5_400_000, { precision: 2 }) // "1h 30m"
```

## Documentation

How-to guides:

- [How to validate a time expression from user input](docs/how-to/validate-user-input.md)
- [How to format a duration for display](docs/how-to/format-a-duration.md)
- [How to pass a duration to an API that takes a number](docs/how-to/pass-a-duration-to-an-api.md)

Reference:

- [`@sanely/duration` reference](docs/reference.md)

Explanation:

- [About the forms of a time expression](docs/explanation/about-time-expression-forms.md)

## Contributing

Read the [architecture](docs/architecture.md), [testing guide](docs/testing.md), and root [contributor guide](../../CONTRIBUTING.md) before changing the package.

## License

MIT. See [LICENSE](../../LICENSE).
