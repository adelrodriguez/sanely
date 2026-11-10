// Compile-time checks only: `pnpm run check` enforces this file, and Vitest never runs it.
import { expectTypeOf } from "vitest"
import type { UNITS } from "#time.ts"

type UnitRow = (typeof UNITS)[number]

// Duration's `format` writes a unit's `long`, `longPlural`, and `short` spellings, and its `parse`
// reads only aliases. A spelling missing from its own unit's aliases makes `format` output that
// `parse` rejects.
type UnlistedSpelling<Row extends UnitRow> = Row extends UnitRow
  ? Exclude<Row["long"] | Row["longPlural"] | Row["short"], Row["aliases"][number]>
  : never

// Lists every display spelling of a unit among that unit's own aliases.
expectTypeOf<UnlistedSpelling<UnitRow>>().toBeNever()
