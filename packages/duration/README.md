<div align="center">
  <h1 align="center">⏱️ <code>humanspan</code></h1>

  <p align="center">
    <strong>Parsing and formatting for human-readable time expressions</strong>
  </p>

  <p align="center">
    <a href="https://www.npmjs.com/package/@sanely/duration"><img src="https://img.shields.io/npm/v/@sanely/duration" alt="npm version"></a>
    <a href="https://pkg-size.dev/humanspan"><img src="https://pkg-size.dev/badge/install/23648640" title="Install size for humanspan"></a>
    <a href="https://github.com/adelrodriguez/humanspan/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/humanspan" alt="license"></a>
  </p>
</div>

Humanspan is a zero-dependency TypeScript package for time expressions. Convert `"1h"` to seconds, parse `"1h 30m"` to milliseconds, or format `5_400_000` as `"1h 30m"`.

## What Humanspan does

- Converts time expressions with unit functions such as `seconds("1h")` and `days("1w")`.
- Converts compound time expressions with `convert("1h 30m", "minutes")`.
- Parses compound time expressions into milliseconds.
- Formats milliseconds as short-form or long-form time expressions.
- Checks string literals at compile time with `TimeExpression`.
- Checks runtime values with `isTimeExpression` and `isValidTimeExpression`.
- Throws `InvalidTimeExpressionError` or returns `null` from `safeParse`.
- Provides tree-shakeable named exports with no runtime dependencies.

## Install Humanspan

```bash
# npm
npm install @sanely/duration

# Bun
bun add @sanely/duration

# pnpm
pnpm add @sanely/duration
```

## Convert a time expression

```ts
import { convert, days, hours, minutes, ms, seconds } from "@sanely/duration"

seconds("1h") // 3600
seconds("500ms") // 0.5
minutes("2h") // 120
hours("1d") // 24
days("1w") // 7
ms("30s") // 30_000
convert("1h 30m", "minutes") // 90
```

Use `parse` to convert a compound time expression to milliseconds:

```ts
import { parse } from "@sanely/duration"

parse("1h 30m") // 5_400_000
```

## API reference

### Unit functions

Each unit function accepts one `TimeExpression` and returns a number in the named unit.

```ts
import { days, hours, minutes, months, ms, seconds, weeks, years } from "@sanely/duration"

ms("1s") // 1000
ms("1h") // 3_600_000
seconds("1h") // 3600
seconds("500ms") // 0.5
minutes("2h") // 120
hours("1d") // 24
days("1w") // 7
weeks("1y") // 52.1775
months("1y") // 12
years("365.25d") // 1
```

Every function interprets a bare number as milliseconds:

```ts
ms("100") // 100
seconds("1000") // 1 because "1000" means 1000 milliseconds
```

TypeScript validates expressions at compile time:

```ts
ms("1h") // Compiles
ms("hello") // Type error: "hello" is not a TimeExpression
ms("1h 30m") // Type error: use convert or parse for a compound time expression
```

### `convert`

`convert` accepts a string and returns its value in the named unit. Use it for compound time expressions, which the `TimeExpression` type does not cover.

```ts
import { convert } from "@sanely/duration"

convert("90s", "minutes") // 1.5
convert("1h 30m", "minutes") // 90
convert("1 day, 6 hours", "hours") // 30
```

Unit names are the long plural forms: `"milliseconds"`, `"seconds"`, `"minutes"`, `"hours"`, `"days"`, `"weeks"`, `"months"`, `"years"`.

### `parse` and `safeParse`

`parse` returns the value of a time expression or compound time expression in milliseconds.

```ts
import { parse } from "@sanely/duration"

parse("1h") // 3_600_000
parse("1h 30m") // 5_400_000
parse("1 day, 6 hours, 30 minutes") // 109_800_000
```

If the input is invalid, `parse` throws `InvalidTimeExpressionError`. `safeParse` returns `null` instead.

```ts
import { safeParse } from "@sanely/duration"

safeParse("1h 30m") // 5_400_000
safeParse("hello") // null
```

### `format`

`format` converts milliseconds to a time expression.

```ts
import { format } from "@sanely/duration"

format(3_600_000) // "1h"
format(500) // "500ms"
format(-3_600_000) // "-1h"
format(3_600_000, { long: true }) // "1 hour"
format(5_432_100, { precision: 3 }) // "1h 30m 32s"
format(12_096_000_000, { units: ["days"] }) // "140d"
```

| Option      | Type         | Default   | Description                               |
| ----------- | ------------ | --------- | ----------------------------------------- |
| `long`      | `boolean`    | `false`   | Use long form, such as `"1 hour"`         |
| `precision` | `number`     | `1`       | Maximum number of unit segments to output |
| `units`     | `UnitName[]` | all units | Restrict the output to these units        |

When `precision` is `1` (the default), the value rounds to the single largest applicable unit. Rounding carries into the next unit when it reaches the boundary (`format(59_999)` is `"1m"`, not `"60s"`). Higher precision values decompose the duration into multiple segments.

The last segment absorbs the remainder. Humanspan rounds that remainder to the largest unit with a nonzero result. The round-trip error is at most half of the last segment's unit. For example, `format(7_200_500, { precision: 2 })` returns `"2h 1s"`, which is within 500 milliseconds of the input.

Months and years are approximations (a year is 365.25 days; a month is one twelfth of that). Use the `units` option when you need exact decomposition:

```ts
import { format, MS_PER_WEEK } from "@sanely/duration"

format(5 * MS_PER_WEEK, { precision: 2 }) // "1mo 1w", an approximation
format(5 * MS_PER_WEEK, { precision: 2, units: ["weeks", "days"] }) // "5w", exact
```

The output of `format` is always a valid input for `parse`:

```ts
const expr = format(5_400_000, { precision: 2 }) // "1h 30m"
parse(expr) // 5_400_000
```

### `isTimeExpression`

`isTimeExpression` checks whether a string is one time expression in strict form and never throws. It is the exact runtime check, so it accepts a strict subset of the `TimeExpression` type. Some strings, such as `"0x10h"` or `" 1h"`, satisfy the type but the guard rejects them, because template literal types cannot express the exact number grammar.

```ts
import { ms, isTimeExpression } from "@sanely/duration"

isTimeExpression("1h") // true
isTimeExpression("500ms") // true
isTimeExpression("1h 30m") // false. Use isValidTimeExpression for compound input.
isTimeExpression("hello") // false

const input: string = getUserInput()
if (isTimeExpression(input)) {
  ms(input) // TypeScript knows `input` is TimeExpression
}
```

### `isValidTimeExpression`

`isValidTimeExpression` checks whether `parse` accepts a string. It accepts both time expressions and compound time expressions and never throws.

```ts
import { isValidTimeExpression } from "@sanely/duration"

isValidTimeExpression("1h") // true
isValidTimeExpression("1h 30m") // true
isValidTimeExpression("hello") // false
```

### Constants

Use the constants for arithmetic in milliseconds, such as a cache TTL or a rate-limit window:

```ts
import {
  MS_PER_SECOND, // 1_000
  MS_PER_MINUTE, // 60_000
  MS_PER_HOUR, // 3_600_000
  MS_PER_DAY, // 86_400_000
  MS_PER_WEEK, // 604_800_000
  MS_PER_MONTH, // 2_629_800_000
  MS_PER_YEAR, // 31_557_600_000
} from "@sanely/duration"
```

## Compound expression grammar

The parser adds all segments in a compound time expression. Duplicate units add to the total, and segment order does not change the result.

```ts
// Space-separated
parse("1h 30m") // 5_400_000

// Comma-separated (single commas only)
parse("1h, 30m") // 5_400_000

// Concatenated (no separator)
parse("1h30m") // 5_400_000

// Long form
parse("1 hour 30 minutes") // 5_400_000
parse("1 year 2 weeks 5 days") // 33_199_200_000

// Duplicate units are additive
parse("1h 2h") // 10_800_000

// Order doesn't matter
parse("30m 1h") // 5_400_000
```

The parser rejects malformed delimiters such as `",1h"`, `"1h,"`, `"1h,,30m"`, and `"1h, ,30m"`. A segment with no separator before it must start with a digit: `"1h .5m"` and `"1h0.5m"` are valid, but `"1h.5m"` is not. A bare number is valid only as a complete time expression. Every segment in a compound time expression must have a unit.

### Signs

One optional sign (`-` or `+`) can prefix the expression. It applies to the whole value. Signs on later segments are invalid.

```ts
parse("-1h 30m") // -5_400_000
parse("+1h 30m") // 5_400_000
parse("-1h30m") // -5_400_000

parse("1h -30m") // Throws because a later segment has a sign
parse("- 1h") // Throws because the sign is not attached to the number
```

### Strict and lenient grammar

`parse` uses the lenient form. It ignores unit case and permits flexible whitespace, so `"1   HOUR"` is valid. `isTimeExpression` checks the strict form exactly, and the `TimeExpression` type checks it as well as a template literal type can. This form permits at most one space and accepts lowercase, capitalized, or uppercase units. `parse` accepts every strict-form time expression.

### Supported units

Spaces between number and unit are optional. Numeric tokens support decimals and exponent notation (`"1e3ms"`).

| Unit         | Short | Aliases                                        |
| ------------ | ----- | ---------------------------------------------- |
| Milliseconds | `ms`  | `milliseconds`, `millisecond`, `msecs`, `msec` |
| Seconds      | `s`   | `seconds`, `second`, `secs`, `sec`             |
| Minutes      | `m`   | `minutes`, `minute`, `mins`, `min`             |
| Hours        | `h`   | `hours`, `hour`, `hrs`, `hr`                   |
| Days         | `d`   | `days`, `day`                                  |
| Weeks        | `w`   | `weeks`, `week`                                |
| Months       | `mo`  | `months`, `month`                              |
| Years        | `y`   | `years`, `year`, `yrs`, `yr`                   |

## Types

```ts
import type { TimeExpression, FormatOptions, Unit, UnitName } from "@sanely/duration"
```

- `TimeExpression` is a template literal type for one time expression, such as `"1h"`, `"30s"`, or `"500ms"`. Unit functions use this type and reject invalid string literals at compile time. The check is best-effort: some strings, such as `"0x10h"`, satisfy the type but throw at runtime. Use `isTimeExpression` for an exact check.
- `FormatOptions` defines the `long`, `precision`, and `units` options for `format`.
- `Unit` is a union of all unit aliases, such as `"hours"`, `"h"`, and `"hr"`.
- `UnitName` is a union of the canonical unit names. `convert` and the `units` format option use these names.

## Errors

`parse`, `convert`, and the unit functions throw `InvalidTimeExpressionError` when an input:

- Is not a string.
- Is empty.
- Exceeds 200 characters.
- Does not match the grammar.
- Overflows the representable range.

The error stores the invalid input in its `value` property. `convert` also throws `RangeError` for an unknown unit name.

```ts
import { parse, InvalidTimeExpressionError } from "@sanely/duration"

try {
  parse(userInput)
} catch (error) {
  if (error instanceof InvalidTimeExpressionError) {
    console.error(error.message) // Invalid time expression: ... Received: "..."
  }
}
```

`safeParse`, `isTimeExpression`, and `isValidTimeExpression` never throw. For invalid input, `safeParse` returns `null`, and both guards return `false`.

`format` throws:

- `TypeError` when the input is not a finite number, including `Infinity`, `-Infinity`, and `NaN`.
- `RangeError` when `precision` is not a finite positive integer.
- `RangeError` when `units` is empty or contains an unknown unit name.

## License

MIT
