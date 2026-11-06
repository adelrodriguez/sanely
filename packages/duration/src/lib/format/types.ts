import type { UnitName } from "#lib/units/types.ts"

/**
 * Options for `format`.
 */
export interface FormatOptions {
  /**
   * Use verbose formatting (`"1 hour"` instead of `"1h"`). Defaults to `false`.
   */
  long?: boolean
  /**
   * Maximum number of unit segments to include. Defaults to `1`.
   */
  precision?: number
  /**
   * Restrict the output to these units. Defaults to all units. The order of the array does not
   * matter; output segments always run from the largest unit to the smallest.
   */
  units?: readonly UnitName[]
}
