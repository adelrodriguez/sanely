import type { UnitAnyCase } from "@sanely/core/time"

/**
 * A single time expression in strict form: a bare number (interpreted as milliseconds), or a number
 * followed by a unit (with or without one space).
 *
 * This type is a best-effort compile-time check of the strict grammar. It is built on `${number}`,
 * so it also accepts some strings that the strict grammar rejects, such as `"0x10h"` or `" 1h"`.
 * `isTimeExpression` is the exact runtime check and accepts a strict subset of this type. `parse`
 * accepts a lenient superset of the strict grammar (flexible whitespace and any unit casing).
 */
export type TimeExpression = `${number}` | `${number}${UnitAnyCase}` | `${number} ${UnitAnyCase}`
