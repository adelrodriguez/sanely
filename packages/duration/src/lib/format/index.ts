import { getUnitByName, UNITS, type UnitDefinition, type UnitName } from "@sanely/core/time"
import type { MillisecondsOnly } from "#lib/shared/duration.ts"
import type { FormatOptions } from "./types.ts"

interface Segment {
  unit: UnitDefinition
  value: number
}

function isNonEmptyStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string")
}

function resolveUnits(names: readonly UnitName[] | undefined): readonly UnitDefinition[] {
  if (names === undefined) {
    return UNITS
  }

  if (!isNonEmptyStringArray(names)) {
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
  let index = units.findIndex((unit) => abs >= unit.ms)
  if (index === -1) {
    index = units.length - 1
  }

  let unit = units[index] ?? smallest
  let value = Math.round(abs / unit.ms)

  // Carry upward: rounding can land exactly on the next larger unit
  // (e.g. 59_999ms rounds to 60s, which is 1m).
  while (index > 0) {
    const larger = units[index - 1]
    if (larger === undefined || value < larger.ms / unit.ms) {
      break
    }
    index -= 1
    unit = larger
    value = Math.round(abs / unit.ms)
  }

  return { unit, value }
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
    if (segments.length >= precision) {
      break
    }

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

  applyCarry(segments, units)

  // Drop trailing zero segments left behind by the carry pass.
  while (segments.length > 1 && segments.at(-1)?.value === 0) {
    segments.pop()
  }

  return segments
}

// If rounding caused a segment to overflow its unit, propagate the overflow into the next larger
// unit (e.g. ["59m", "60s"] becomes ["1h"]).
function applyCarry(segments: Segment[], units: readonly UnitDefinition[]): void {
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const segment = segments[i]
    if (!segment) {
      continue
    }

    const unitIndex = units.indexOf(segment.unit)
    if (unitIndex <= 0) {
      continue
    }

    const larger = units[unitIndex - 1]
    if (!larger) {
      continue
    }

    const ratio = larger.ms / segment.unit.ms
    if (segment.value < ratio) {
      continue
    }

    const carry = Math.floor(segment.value / ratio)
    segment.value -= carry * ratio

    const previous = i > 0 ? segments[i - 1] : undefined
    if (previous?.unit === larger) {
      previous.value += carry
    } else {
      segments.splice(i, 0, { unit: larger, value: carry })
      i += 1
    }
  }
}
