# `@sanely/duration` reference

The package has one entry point, `@sanely/duration`. Every export is a named export.

## Unit functions

```ts
function ms(value: TimeExpression): number
function seconds(value: TimeExpression): number
function minutes(value: TimeExpression): number
function hours(value: TimeExpression): number
function days(value: TimeExpression): number
function weeks(value: TimeExpression): number
function months(value: TimeExpression): number
function years(value: TimeExpression): number
```

Each unit function takes one time expression and returns its value in the unit of the function name. A bare number is milliseconds. A compound time expression is a type error. Use `convert` or `parse` for it.

```ts
import { days, hours, minutes, months, ms, seconds, weeks, years } from "@sanely/duration"

ms("1s") // 1000
ms("1h") // 3_600_000
seconds("1h") // 3600
seconds("500ms") // 0.5
minutes("2h") // 120
hours("1d") // 24
days("1w") // 7
weeks("1y") // 52.17857142857143
months("1y") // 12
years("365.25d") // 1
ms("100") // 100
seconds("1000") // 1, because "1000" is 1000 milliseconds
ms("hello") // Type error: "hello" is not a TimeExpression
ms("1h 30m") // Type error: use convert or parse for a compound time expression
```

The unit functions throw `InvalidTimeExpressionError` for a value that `parse` rejects.

## `convert(value, unit)`

```ts
function convert(value: string, unit: UnitName): number
```

Returns the value of a time expression or a compound time expression in `unit`. `unit` is a unit name: `"milliseconds"`, `"seconds"`, `"minutes"`, `"hours"`, `"days"`, `"weeks"`, `"months"`, or `"years"`.

```ts
import { convert } from "@sanely/duration"

convert("90s", "minutes") // 1.5
convert("1h 30m", "minutes") // 90
convert("1 day, 6 hours", "hours") // 30
```

Throws `InvalidTimeExpressionError` for a value that `parse` rejects, and `RangeError` for an unknown unit name.

## `parse(value)`

```ts
function parse(value: string): number
```

Returns the value of a time expression or a compound time expression in milliseconds. `parse` accepts the lenient form. See [Grammar](#grammar).

```ts
import { parse } from "@sanely/duration"

parse("1h") // 3_600_000
parse("1h 30m") // 5_400_000
parse("1 day, 6 hours, 30 minutes") // 109_800_000
```

Throws `InvalidTimeExpressionError` for invalid input.

## `safeParse(value)`

```ts
function safeParse(value: string): number | null
```

Returns the same value as `parse`, or `null` for invalid input. It never throws.

```ts
import { safeParse } from "@sanely/duration"

safeParse("1h 30m") // 5_400_000
safeParse("hello") // null
```

## `format(milliseconds, options?)`

```ts
function format(milliseconds: number, options?: FormatOptions): string
```

Writes milliseconds as a time expression. `parse` accepts every value that `format` returns.

| Option      | Type         | Default   | Description                            |
| ----------- | ------------ | --------- | -------------------------------------- |
| `long`      | `boolean`    | `false`   | Use the long form, such as `"1 hour"`. |
| `precision` | `number`     | `1`       | The most segments to write.            |
| `units`     | `UnitName[]` | All units | The units that the output can use.     |

```ts
import { format } from "@sanely/duration"

format(3_600_000) // "1h"
format(500) // "500ms"
format(-3_600_000) // "-1h"
format(3_600_000, { long: true }) // "1 hour"
format(5_432_100, { precision: 3 }) // "1h 30m 32s"
format(12_096_000_000, { units: ["days"] }) // "140d"
format(59_999) // "1m"
format(7_200_500, { precision: 2 }) // "2h 1s"
```

With `precision: 1`, `format` rounds the value to the largest unit that applies. The rounding carries into the next unit at the boundary, so `format(59_999)` is `"1m"`. With a higher precision, `format` splits the value into segments. The last segment holds the remainder, rounded to the largest unit with a result that is not zero. The difference from the input is at most half of the unit of the last segment.

`format` throws:

- `TypeError` when `milliseconds` is not a finite number, such as `Infinity`, `-Infinity`, or `NaN`.
- `RangeError` when `precision` is not a finite positive integer.
- `RangeError` when `units` is empty or has an unknown unit name.

## `isTimeExpression(value)`

```ts
function isTimeExpression(value: string): value is TimeExpression
```

Returns `true` when `value` is one time expression in the strict form. It never throws. A `true` result narrows `value` to `TimeExpression`.

```ts
import { isTimeExpression } from "@sanely/duration"

isTimeExpression("1h") // true
isTimeExpression("500ms") // true
isTimeExpression("1h 30m") // false
isTimeExpression("0x10h") // false
isTimeExpression("hello") // false
```

## `isValidTimeExpression(value)`

```ts
function isValidTimeExpression(value: string): boolean
```

Returns `true` when `parse` accepts `value`. It accepts time expressions and compound time expressions, and it never throws.

```ts
import { isValidTimeExpression } from "@sanely/duration"

isValidTimeExpression("1h") // true
isValidTimeExpression("1h 30m") // true
isValidTimeExpression("hello") // false
```

## Constants

The constants hold the milliseconds in one unit.

| Constant        | Value            | Note                   |
| --------------- | ---------------- | ---------------------- |
| `MS_PER_SECOND` | `1_000`          |                        |
| `MS_PER_MINUTE` | `60_000`         |                        |
| `MS_PER_HOUR`   | `3_600_000`      |                        |
| `MS_PER_DAY`    | `86_400_000`     |                        |
| `MS_PER_WEEK`   | `604_800_000`    |                        |
| `MS_PER_MONTH`  | `2_629_800_000`  | One twelfth of a year. |
| `MS_PER_YEAR`   | `31_557_600_000` | 365.25 days.           |

```ts
import { MS_PER_DAY } from "@sanely/duration"

const ttl = 7 * MS_PER_DAY // 604_800_000
```

## Grammar

### Units

A space between the number and the unit is optional. A number can have decimals and an exponent, such as `"1e3ms"`.

| Unit name        | Short | Aliases                                        |
| ---------------- | ----- | ---------------------------------------------- |
| `"milliseconds"` | `ms`  | `milliseconds`, `millisecond`, `msecs`, `msec` |
| `"seconds"`      | `s`   | `seconds`, `second`, `secs`, `sec`             |
| `"minutes"`      | `m`   | `minutes`, `minute`, `mins`, `min`             |
| `"hours"`        | `h`   | `hours`, `hour`, `hrs`, `hr`                   |
| `"days"`         | `d`   | `days`, `day`                                  |
| `"weeks"`        | `w`   | `weeks`, `week`                                |
| `"months"`       | `mo`  | `months`, `month`                              |
| `"years"`        | `y`   | `years`, `year`, `yrs`, `yr`                   |

### Strict and lenient forms

| Form    | Used by                                         | Unit case                            | Whitespace                                |
| ------- | ----------------------------------------------- | ------------------------------------ | ----------------------------------------- |
| Strict  | `isTimeExpression`, `TimeExpression`            | Lowercase, Capitalized, or UPPERCASE | At most one space between number and unit |
| Lenient | `parse`, `safeParse`, `convert`, unit functions | Any case                             | Flexible, such as `"1   HOUR"`            |

`parse` accepts every expression in the strict form.

### Compound time expressions

`parse` adds the segments of a compound time expression. A duplicate unit adds to the total, and the order of the segments does not change the result.

```ts
parse("1h 30m") // 5_400_000, separated by spaces
parse("1h, 30m") // 5_400_000, separated by one comma
parse("1h30m") // 5_400_000, with no separator
parse("1 hour 30 minutes") // 5_400_000
parse("1 year 2 weeks 5 days") // 33_199_200_000
parse("1h 2h") // 10_800_000
parse("30m 1h") // 5_400_000
```

These rules apply:

- A delimiter can be one space, one comma, or one comma and a space. `parse` rejects `",1h"`, `"1h,"`, `"1h,,30m"`, and `"1h, ,30m"`.
- A segment with no separator before it must start with a digit. `"1h .5m"` and `"1h0.5m"` are valid, and `"1h.5m"` is not.
- A bare number is valid only as a complete time expression. Every segment of a compound time expression must have a unit.

### Signs

One optional sign, `-` or `+`, can come before the expression. It applies to the whole value.

```ts
parse("-1h 30m") // -5_400_000
parse("+1h 30m") // 5_400_000
parse("-1h30m") // -5_400_000
parse("1h -30m") // Throws, because a later segment has a sign
parse("- 1h") // Throws, because the sign is not attached to the number
```

## Errors

### `InvalidTimeExpressionError`

`parse`, `convert`, and the unit functions throw `InvalidTimeExpressionError` when the input:

- is not a string,
- is empty,
- has more than 200 characters,
- does not match the grammar, or
- is out of the range that a number can hold.

The `value` property holds the invalid input. The message has the form `Invalid time expression: <reason>. Received: "<input>"`.

```ts
import { InvalidTimeExpressionError, parse } from "@sanely/duration"

try {
  parse("hello")
} catch (error) {
  if (error instanceof InvalidTimeExpressionError) {
    error.value // "hello"
  }
}
```

`safeParse`, `isTimeExpression`, and `isValidTimeExpression` never throw.

## Types

| Type                                                                              | Describes                                                                                                                                          |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TimeExpression`                                                                  | One time expression in the strict form, as a template literal type. Some strings, such as `"0x10h"`, satisfy the type and still throw at run time. |
| `FormatOptions`                                                                   | The `long`, `precision`, and `units` options of `format`.                                                                                          |
| `Unit`                                                                            | Every unit alias, such as `"hours"`, `"h"`, and `"hr"`.                                                                                            |
| `UnitAnyCase`                                                                     | A `Unit` in lowercase, Capitalized, or UPPERCASE.                                                                                                  |
| `UnitName`                                                                        | The unit names that `convert` and the `units` option of `format` use.                                                                              |
| `Milliseconds`, `Seconds`, `Minutes`, `Hours`, `Days`, `Weeks`, `Months`, `Years` | The aliases of one unit.                                                                                                                           |

```ts
import type { FormatOptions, TimeExpression, Unit, UnitName } from "@sanely/duration"
```
