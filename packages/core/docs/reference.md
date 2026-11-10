# `@sanely/core` reference

The package has one entry point, `@sanely/core/time`. Every export is a named export.

## Clock ratios

```ts
const MINUTES_PER_HOUR: 60
const HOURS_PER_DAY: 24
```

The clock ratios give the minutes in one hour and the hours in one nominal day. Their types are the literal values, so a type can count with them.

```ts
import { HOURS_PER_DAY, MINUTES_PER_HOUR } from "@sanely/core/time"

HOURS_PER_DAY * MINUTES_PER_HOUR // 1440
```

## Millisecond constants

```ts
const MS_PER_SECOND: 1000
const MS_PER_MINUTE: number
const MS_PER_HOUR: number
const MS_PER_DAY: number
const MS_PER_WEEK: number
const MS_PER_MONTH: number
const MS_PER_YEAR: number
```

Each constant is the length of one unit in milliseconds.

| Constant        | Value            |
| --------------- | ---------------- |
| `MS_PER_SECOND` | `1_000`          |
| `MS_PER_MINUTE` | `60_000`         |
| `MS_PER_HOUR`   | `3_600_000`      |
| `MS_PER_DAY`    | `86_400_000`     |
| `MS_PER_WEEK`   | `604_800_000`    |
| `MS_PER_MONTH`  | `2_629_800_000`  |
| `MS_PER_YEAR`   | `31_557_600_000` |

A year is 365.25 days, and a month is one twelfth of that year. Neither follows the calendar.

```ts
import { MS_PER_MINUTE, MS_PER_SECOND } from "@sanely/core/time"

const timeout = 30 * MS_PER_SECOND // 30_000
const interval = 5 * MS_PER_MINUTE // 300_000
```

## `UNITS`

```ts
const UNITS: readonly [
  {
    readonly aliases: readonly ["years", "year", "yrs", "yr", "y"]
    readonly long: "year"
    readonly longPlural: "years"
    readonly ms: number
    readonly short: "y"
  },
  // One entry for each of months, weeks, days, hours, minutes, seconds, and milliseconds.
]
```

`UNITS` is the unit table. It lists the eight units from largest to smallest. Each entry is a read-only `UnitDefinition` with literal types.

| `longPlural`     | `long`          | `short` | `aliases`                                                      |
| ---------------- | --------------- | ------- | -------------------------------------------------------------- |
| `"years"`        | `"year"`        | `"y"`   | `"years"`, `"year"`, `"yrs"`, `"yr"`, `"y"`                    |
| `"months"`       | `"month"`       | `"mo"`  | `"months"`, `"month"`, `"mo"`                                  |
| `"weeks"`        | `"week"`        | `"w"`   | `"weeks"`, `"week"`, `"w"`                                     |
| `"days"`         | `"day"`         | `"d"`   | `"days"`, `"day"`, `"d"`                                       |
| `"hours"`        | `"hour"`        | `"h"`   | `"hours"`, `"hour"`, `"hrs"`, `"hr"`, `"h"`                    |
| `"minutes"`      | `"minute"`      | `"m"`   | `"minutes"`, `"minute"`, `"mins"`, `"min"`, `"m"`              |
| `"seconds"`      | `"second"`      | `"s"`   | `"seconds"`, `"second"`, `"secs"`, `"sec"`, `"s"`              |
| `"milliseconds"` | `"millisecond"` | `"ms"`  | `"milliseconds"`, `"millisecond"`, `"msecs"`, `"msec"`, `"ms"` |

Each alias belongs to exactly one unit. `"m"` means minutes, and `"mo"` means months.

```ts
import { UNITS } from "@sanely/core/time"

UNITS.map((unit) => unit.short) // ["y", "mo", "w", "d", "h", "m", "s", "ms"]
```

## `UNIT_ALIASES`

```ts
const UNIT_ALIASES: readonly string[]
```

`UNIT_ALIASES` lists every unit alias once, in the order of `UNITS`.

```ts
import { UNIT_ALIASES } from "@sanely/core/time"

UNIT_ALIASES.length // 34
UNIT_ALIASES.includes("hrs") // true
```

## `getUnitMs`

```ts
function getUnitMs(alias: string): number | undefined
```

`getUnitMs` returns the length in milliseconds of the unit that `alias` names. It accepts an alias in any casing. It returns `undefined` when `alias` is not a unit alias.

```ts
import { getUnitMs } from "@sanely/core/time"

getUnitMs("h") // 3_600_000
getUnitMs("Hours") // 3_600_000
getUnitMs("parsec") // undefined
```

## `getUnitByName`

```ts
function getUnitByName(name: string): UnitDefinition | undefined
```

`getUnitByName` returns the unit whose unit name is `name`. A unit name is a lowercase `longPlural`, such as `"hours"`. It returns `undefined` for any other string, including a singular name, a short alias, or another casing.

```ts
import { getUnitByName } from "@sanely/core/time"

getUnitByName("hours")?.short // "h"
getUnitByName("hour") // undefined
getUnitByName("HOURS") // undefined
```

## `UnitDefinition`

```ts
interface UnitDefinition {
  readonly aliases: readonly string[]
  readonly long: string
  readonly longPlural: string
  readonly ms: number
  readonly short: string
}
```

`UnitDefinition` is the shape of one entry in `UNITS`.

| Property     | Description                                                           |
| ------------ | --------------------------------------------------------------------- |
| `aliases`    | Every lowercase alias of the unit. It includes the three names below. |
| `long`       | The singular name, such as `"hour"`.                                  |
| `longPlural` | The unit name, such as `"hours"`.                                     |
| `ms`         | The length of the unit in milliseconds.                               |
| `short`      | The shortest alias, such as `"h"`.                                    |

```ts
import { getUnitByName, type UnitDefinition } from "@sanely/core/time"

const hours: UnitDefinition | undefined = getUnitByName("hours")
```

## Unit types

```ts
type Years = "years" | "year" | "yrs" | "yr" | "y"
type Months = "months" | "month" | "mo"
type Weeks = "weeks" | "week" | "w"
type Days = "days" | "day" | "d"
type Hours = "hours" | "hour" | "hrs" | "hr" | "h"
type Minutes = "minutes" | "minute" | "mins" | "min" | "m"
type Seconds = "seconds" | "second" | "secs" | "sec" | "s"
type Milliseconds = "milliseconds" | "millisecond" | "msecs" | "msec" | "ms"
type Unit = Years | Months | Weeks | Days | Hours | Minutes | Seconds | Milliseconds
type UnitName =
  | "years"
  | "months"
  | "weeks"
  | "days"
  | "hours"
  | "minutes"
  | "seconds"
  | "milliseconds"
type UnitAnyCase = Unit | Capitalize<Unit> | Uppercase<Unit>
```

The unit types derive from `UNITS`.

- Each per-unit type, such as `Hours`, is the union of that unit's aliases.
- `Unit` is the union of every alias.
- `UnitName` is the union of every unit name.
- `UnitAnyCase` adds the Capitalized and UPPERCASE forms of every alias, such as `"Hour"` and `"HOURS"`.

```ts
import type { UnitAnyCase, UnitName } from "@sanely/core/time"

const name: UnitName = "minutes"
const alias: UnitAnyCase = "Hrs"
```
