import type { AMBIGUOUS_UNITS, UNITS } from "./table"

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
 * Canonical unit name (long plural).
 */
export type UnitName = UnitRow["longPlural"]

/**
 * A unit token that `findUnit` rejects because it means another unit in common notations.
 */
export type AmbiguousUnit = keyof typeof AMBIGUOUS_UNITS

/**
 * What to write instead of an ambiguous unit, such as `"M"`.
 */
export type AmbiguousUnitHint<T extends AmbiguousUnit> = (typeof AMBIGUOUS_UNITS)[T]

/**
 * Any casing variant of a time unit (lowercase, Capitalized, UPPERCASE), except an `AmbiguousUnit`.
 */
export type UnitAnyCase = Exclude<Unit | Capitalize<Unit> | Uppercase<Unit>, AmbiguousUnit>
