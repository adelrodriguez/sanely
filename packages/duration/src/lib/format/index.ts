import { getUnitByName, UNITS, type UnitDefinition, type UnitName } from "@sanely/core/time"
import type { MillisecondsOnly } from "#lib/shared/duration.ts"
import type { FormatOptions } from "./types.ts"

interface Segment {
  unit: UnitDefinition
  value: number
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

function resolveUnits(names: readonly UnitName[] | undefined): readonly UnitDefinition[] {
  if (names === undefined) {
    return UNITS
  }

  if (!isStringArray(names)) {
    throw new RangeError('Option "units" must be a non-empty array of unit names.')
  }

  const selected = new Set<string>()
  for (const name of names) {
    if (!getUnitByName(name)) {
      throw new RangeError(`Option "units" contains an unknown unit name. Received: ${name}`)
    }
    selected.add(name)
  }

  return UNITS.filter((unit) => selected.has(unit.longPlural))
}

function formatSegment(value: number, unit: UnitDefinition, long: boolean): string {
  if (long) {
    const name = Math.abs(value) === 1 ? unit.long : unit.longPlural
    return `${value} ${name}`
  }
  return `${value}${unit.short}`
}

/**
 * Format a millisecond value into a human-readable time expression.
 *
 * The returned string is always a valid input for `parse`. The last output segment rounds the
 * remainder to the largest unit with a nonzero rounded value, so the round-trip error is at most
 * half of that segment's unit.
 *
 * @example
 *   format(3_600_000) // "1h"
 *   format(3_600_000, { long: true }) // "1 hour"
 *   format(500) // "500ms"
 *   format(5_432_100, { precision: 3 }) // "1h 30m 32s"
 *   format(12_096_000_000, { units: ["days"] }) // "140d"
 *
 * @param milliseconds - The value in milliseconds to format. A `Duration` in another unit, such as
 *   the result of `seconds()`, is a type error.
 * @param options - Formatting options
 *
 * @returns A formatted time expression string
 * @throws {TypeError} If the input is not a finite number
 * @throws {RangeError} If `options.precision` is not a finite positive integer, or if
 *   `options.units` is empty or contains an unknown unit name
 */
export function format<const T extends number>(
  milliseconds: MillisecondsOnly<T>,
  options?: FormatOptions
): string {
  if (typeof milliseconds !== "number" || !Number.isFinite(milliseconds)) {
    throw new TypeError(
      `Value provided to format() must be a finite number. Received: ${String(milliseconds)}`
    )
  }

  const long = options?.long ?? false
  const precision = options?.precision ?? 1

  if (!Number.isFinite(precision) || !Number.isInteger(precision) || precision < 1) {
    throw new RangeError(
      `Option "precision" must be a finite positive integer. Received: ${String(precision)}`
    )
  }

  const units = resolveUnits(options?.units)
  const smallest = units.at(-1)
  if (!smallest) {
    throw new RangeError('Option "units" must be a non-empty array of unit names.')
  }

  if (milliseconds === 0) {
    return formatSegment(0, smallest, long)
  }

  const abs = Math.abs(milliseconds)
  const segments =
    precision === 1
      ? [pickSingleSegment(abs, units, smallest)]
      : buildSegments(abs, precision, units, smallest)

  // Avoid a signed zero when rounding collapses the value to zero.
  if (segments.every((segment) => segment.value === 0)) {
    return formatSegment(0, smallest, long)
  }

  const body = segments.map((segment) => formatSegment(segment.value, segment.unit, long)).join(" ")

  return milliseconds < 0 ? `-${body}` : body
}

function pickSingleSegment(
  abs: number,
  units: readonly UnitDefinition[],
  smallest: UnitDefinition
): Segment {
  const largerUnit = mapLargerUnits(units)
  let unit = units.find((candidate) => abs >= candidate.ms) ?? smallest
  let value = Math.round(abs / unit.ms)

  // Carry upward: rounding can land exactly on the next larger unit
  // (e.g. 59_999ms rounds to 60s, which is 1m).
  let larger = largerUnit.get(unit)
  while (larger && value >= larger.ms / unit.ms) {
    unit = larger
    value = Math.round(abs / unit.ms)
    larger = largerUnit.get(unit)
  }

  return { unit, value }
}

// Map each unit to the next larger one. The units run from the largest to the smallest, so the
// largest unit has no entry.
function mapLargerUnits(
  units: readonly UnitDefinition[]
): ReadonlyMap<UnitDefinition, UnitDefinition> {
  const largerUnit = new Map<UnitDefinition, UnitDefinition>()
  units.reduce((larger, unit) => {
    largerUnit.set(unit, larger)
    return unit
  })
  return largerUnit
}

// Split a value into whole units and a remainder in [0, unitMs). `%` is exact for doubles. Up to
// MAX_SAFE_INTEGER, `value - rest` is an exact multiple of the unit, so the division is exact too.
// Above it, every double is an integer, and BigInt division gives the exact count.
function divideByUnit(value: number, unitMs: number): { rest: number; whole: number } {
  if (value <= Number.MAX_SAFE_INTEGER) {
    const rest = value % unitMs
    return { rest, whole: (value - rest) / unitMs }
  }

  const exact = BigInt(value)
  const divisor = BigInt(unitMs)
  return { rest: Number(exact % divisor), whole: Number(exact / divisor) }
}

function buildSegments(
  abs: number,
  precision: number,
  units: readonly UnitDefinition[],
  smallest: UnitDefinition
): Segment[] {
  const segments: Segment[] = []
  let remaining = abs

  for (const unit of units) {
    // The last allowed segment absorbs the remainder: pick the largest unit
    // with a nonzero rounded value.
    if (segments.length === precision - 1 || unit === smallest) {
      const rounded = Math.round(remaining / unit.ms)
      if (rounded > 0) {
        segments.push({ unit, value: rounded })
        break
      }
      continue
    }

    const { rest, whole } = divideByUnit(remaining, unit.ms)
    if (whole > 0) {
      segments.push({ unit, value: whole })
      remaining = rest
    }
  }

  if (segments.length === 0) {
    segments.push({ unit: smallest, value: Math.round(abs / smallest.ms) })
  }

  const carried = applyCarry(segments, units)

  // Drop trailing zero segments left behind by the carry pass.
  while (carried.length > 1 && carried.at(-1)?.value === 0) {
    carried.pop()
  }

  return carried
}

// If rounding caused a segment to overflow its unit, propagate the overflow into the next larger
// unit (e.g. ["59m", "60s"] becomes ["1h"]). The segments run from the largest unit to the
// smallest, so the pass starts at the end, and a carry can create a segment that carries again.
function applyCarry(segments: readonly Segment[], units: readonly UnitDefinition[]): Segment[] {
  const largerUnit = mapLargerUnits(units)
  const pending = segments.map((segment) => ({ ...segment }))
  const carried: Segment[] = []
  let segment: Segment | undefined

  while ((segment = pending.pop())) {
    const larger = largerUnit.get(segment.unit)
    const ratio = larger ? larger.ms / segment.unit.ms : Number.POSITIVE_INFINITY
    const carry = Math.floor(segment.value / ratio)

    if (larger && carry > 0) {
      segment.value -= carry * ratio
      const previous = pending.at(-1)
      if (previous?.unit === larger) {
        previous.value += carry
      } else {
        pending.push({ unit: larger, value: carry })
      }
    }

    carried.unshift(segment)
  }

  return carried
}
