import {
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  MS_PER_MONTH,
  MS_PER_SECOND,
  MS_PER_WEEK,
  MS_PER_YEAR,
} from "./constants"

/**
 * Canonical runtime definition for a unit and its aliases.
 */
export interface UnitDefinition {
  readonly aliases: readonly string[]
  readonly long: string
  readonly longPlural: string
  readonly ms: number
  readonly short: string
}

/**
 * The single source of truth for all supported units, ordered from largest to smallest. The alias
 * unions in `types.ts`, the parse grammar in `expression/grammar.ts`, and the format output all
 * derive from this table.
 */
export const UNITS = [
  {
    aliases: ["years", "year", "yrs", "yr", "y"],
    long: "year",
    longPlural: "years",
    ms: MS_PER_YEAR,
    short: "y",
  },
  {
    aliases: ["months", "month", "mo"],
    long: "month",
    longPlural: "months",
    ms: MS_PER_MONTH,
    short: "mo",
  },
  {
    aliases: ["weeks", "week", "w"],
    long: "week",
    longPlural: "weeks",
    ms: MS_PER_WEEK,
    short: "w",
  },
  {
    aliases: ["days", "day", "d"],
    long: "day",
    longPlural: "days",
    ms: MS_PER_DAY,
    short: "d",
  },
  {
    aliases: ["hours", "hour", "hrs", "hr", "h"],
    long: "hour",
    longPlural: "hours",
    ms: MS_PER_HOUR,
    short: "h",
  },
  {
    aliases: ["minutes", "minute", "mins", "min", "m"],
    long: "minute",
    longPlural: "minutes",
    ms: MS_PER_MINUTE,
    short: "m",
  },
  {
    aliases: ["seconds", "second", "secs", "sec", "s"],
    long: "second",
    longPlural: "seconds",
    ms: MS_PER_SECOND,
    short: "s",
  },
  {
    aliases: ["milliseconds", "millisecond", "msecs", "msec", "ms"],
    long: "millisecond",
    longPlural: "milliseconds",
    ms: 1,
    short: "ms",
  },
] as const satisfies readonly UnitDefinition[]

/**
 * Every unit alias, without duplicates.
 */
export const UNIT_ALIASES: readonly string[] = [...new Set(UNITS.flatMap((unit) => unit.aliases))]

const UNIT_MS_BY_ALIAS: ReadonlyMap<string, number> = new Map(
  UNITS.flatMap((unit) => unit.aliases.map((alias) => [alias, unit.ms] as const))
)

const UNIT_BY_NAME: ReadonlyMap<string, UnitDefinition> = new Map(
  UNITS.map((unit) => [unit.longPlural, unit])
)

/**
 * Look up the millisecond multiplier for a lowercase unit alias.
 */
export function getUnitMs(alias: string): number | undefined {
  return UNIT_MS_BY_ALIAS.get(alias)
}

/**
 * Look up a unit definition by its long plural name (e.g. `"seconds"`).
 */
export function getUnitByName(name: string): UnitDefinition | undefined {
  return UNIT_BY_NAME.get(name)
}
