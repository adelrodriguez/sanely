import type { UNITS } from "./table"

type UnitRow = (typeof UNITS)[number]

type AliasesOf<Long extends UnitRow["long"]> = Extract<UnitRow, { long: Long }>["aliases"][number]

/**
 * Year unit aliases.
 */
export type Years = AliasesOf<"year">

/**
 * Month unit aliases.
 */
export type Months = AliasesOf<"month">

/**
 * Week unit aliases.
 */
export type Weeks = AliasesOf<"week">

/**
 * Day unit aliases.
 */
export type Days = AliasesOf<"day">

/**
 * Hour unit aliases.
 */
export type Hours = AliasesOf<"hour">

/**
 * Minute unit aliases.
 */
export type Minutes = AliasesOf<"minute">

/**
 * Second unit aliases.
 */
export type Seconds = AliasesOf<"second">

/**
 * Millisecond unit aliases.
 */
export type Milliseconds = AliasesOf<"millisecond">

/**
 * Union of all recognized time unit strings, derived from the `UNITS` table.
 */
export type Unit = UnitRow["aliases"][number]

/**
 * Canonical unit name (long plural), used by `convert` and the `units` format option.
 */
export type UnitName = UnitRow["longPlural"]

/**
 * Any casing variant of a time unit (lowercase, Capitalized, UPPERCASE).
 */
export type UnitAnyCase = Unit | Capitalize<Unit> | Uppercase<Unit>
