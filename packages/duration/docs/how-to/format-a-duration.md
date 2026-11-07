# How to format a duration for display

This guide shows you how to turn milliseconds into a time expression for a person to read, such as `"1h 30m"` or `"2 hours"`.

1. Call `format` with the milliseconds:

   ```ts
   import { format } from "@sanely/duration"

   format(5_400_000) // "2h"
   ```

   By default, `format` writes one segment and rounds to the largest unit.

2. To show more detail, set `precision` to the most segments that you want:

   ```ts
   format(5_400_000, { precision: 2 }) // "1h 30m"
   format(5_432_100, { precision: 3 }) // "1h 30m 32s"
   ```

3. To write full unit names, set `long: true`:

   ```ts
   format(3_600_000, { long: true }) // "1 hour"
   ```

## Keep the output exact

Months and years are approximations: a year is 365.25 days, and a month is one twelfth of a year. If the output must not use them, list the units that it can use:

```ts
import { format, MS_PER_WEEK } from "@sanely/duration"

format(5 * MS_PER_WEEK, { precision: 2 }) // "1mo 1w", an approximation
format(5 * MS_PER_WEEK, { precision: 2, units: ["weeks", "days"] }) // "5w", exact
```

To show a large value in one unit, such as days, give only that unit:

```ts
format(12_096_000_000, { units: ["days"] }) // "140d"
```

## Read the value back

`parse` accepts every value that `format` returns, so you can store the formatted value and read it back:

```ts
const expression = format(5_400_000, { precision: 2 }) // "1h 30m"
parse(expression) // 5_400_000
```

The last segment is rounded, so the value that you read back can differ from the input by up to half of the unit of the last segment. Refer to the [`format` reference](../reference.md#formatmilliseconds-options) for the rounding rules and the errors.
