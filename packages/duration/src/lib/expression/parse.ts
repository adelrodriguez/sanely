import { findUnit, getAmbiguousUnitHint } from "@sanely/core/time"
import { type Duration, toDuration } from "#lib/shared/duration.ts"
import { InvalidTimeExpressionError } from "./errors"
import { LENIENT_UNIT_PATTERN, NUMBER_PATTERN } from "./grammar"

const MAX_LENGTH = 200

// Each segment is an unsigned number with an optional unit. Signs are handled once for the whole
// expression, before segment matching.
const SEGMENT_RE = new RegExp(`(${NUMBER_PATTERN})\\s*(${LENIENT_UNIT_PATTERN})?`, "gi")

// The parts of a number that NUMBER_PATTERN matched: whole digits, fraction digits, and exponent.
const NUMBER_PARTS_RE = /^(\d*)\.?(\d*)(?:e([+-]?\d+))?$/i

// 10 ** 22 is the largest power of ten that a double holds exactly.
const MAX_EXACT_POWER_OF_TEN = 22

const WHITESPACE_RE = /^\s*$/
const COMMA_SEPARATOR_RE = /^\s*,\s*$/

function isValidGap(gap: string, isFirstSegment: boolean): boolean {
  if (WHITESPACE_RE.test(gap)) {
    return true
  }

  if (isFirstSegment) {
    return false
  }

  return COMMA_SEPARATOR_RE.test(gap)
}

/**
 * Parse a time expression string into milliseconds.
 *
 * Accepts both time expressions (`"1h"`) and compound time expressions (`"1h 30m"`). Segments are
 * summed together, so duplicate units are additive and segment order does not matter. Segments can
 * be separated by whitespace, a single comma, or nothing. A segment with no separator before it
 * must start with a digit, so `"1h.5m"` is invalid. A bare number (no unit) is interpreted as
 * milliseconds and is only valid on its own.
 *
 * One optional sign (`-` or `+`) can prefix the expression and applies to the whole value. Signs
 * are not allowed on later segments.
 *
 * The parse grammar is a lenient superset of the strict `TimeExpression` form: it is
 * case-insensitive and permits flexible whitespace between the number and the unit.
 *
 * @example
 *   parse("1h") // 3_600_000
 *   parse("30s") // 30_000
 *   parse("1h 30m") // 5_400_000
 *   parse("-1h 30m") // -5_400_000
 *   parse("1 day, 6 hours, 30 minutes") // 109_800_000
 *
 * @param value - A time expression string to parse
 *
 * @returns The total value in milliseconds
 * @throws {InvalidTimeExpressionError} If the input is not a string, is empty, exceeds 200
 *   characters, or cannot be parsed as a time expression
 */
export function parse(value: string): Duration<"milliseconds"> {
  return parseExpression(value).milliseconds
}

/**
 * A parsed time expression, and whether it was a bare number. A bare number means milliseconds.
 */
export interface ParsedExpression {
  readonly isBare: boolean
  readonly milliseconds: Duration<"milliseconds">
}

/**
 * Parse a time expression like `parse`, and also report whether it was a bare number.
 */
export function parseExpression(value: string): ParsedExpression {
  if (typeof value !== "string") {
    throw new InvalidTimeExpressionError(value, "value must be a string")
  }

  if (value.length === 0 || value.length > MAX_LENGTH) {
    throw new InvalidTimeExpressionError(
      value,
      `value must have between 1 and ${MAX_LENGTH} characters`
    )
  }

  const trimmed = value.trim()

  let sign = 1
  let body = trimmed
  if (trimmed.startsWith("-")) {
    sign = -1
    body = trimmed.slice(1)
  } else if (trimmed.startsWith("+")) {
    body = trimmed.slice(1)
  }

  if (body !== trimmed && (body.length === 0 || WHITESPACE_RE.test(body.charAt(0)))) {
    throw new InvalidTimeExpressionError(value, "a sign must be attached to the first number")
  }

  SEGMENT_RE.lastIndex = 0

  let total = 0
  let prevEnd = 0
  let segmentCount = 0
  let hasBareSegment = false
  let match: RegExpExecArray | null

  while ((match = SEGMENT_RE.exec(body)) !== null) {
    const gap = body.slice(prevEnd, match.index)
    if (!isValidGap(gap, segmentCount === 0)) {
      if (gap.includes("-") || gap.includes("+")) {
        throw new InvalidTimeExpressionError(value, "only one leading sign is allowed")
      }
      throw new InvalidTimeExpressionError(value, "value is not a valid time expression")
    }

    const segment = match[0]
    const number = match[1] ?? ""
    const unitToken = match[2]

    // Without this check, "1h.5m" reads as "1h 0.5m".
    if (segmentCount > 0 && gap === "" && segment.startsWith(".")) {
      throw new InvalidTimeExpressionError(
        value,
        "a segment that follows another segment with no separator must start with a digit"
      )
    }

    let multiplier = 1
    if (unitToken === undefined) {
      hasBareSegment = true
    } else {
      const unit = findUnit(unitToken)
      // The lenient pattern matches only unit aliases, so findUnit rejects only an ambiguous one.
      if (!unit) {
        throw new InvalidTimeExpressionError(
          value,
          `"${unitToken}" is ambiguous: ${String(getAmbiguousUnitHint(unitToken))}`
        )
      }
      multiplier = unit.ms
    }

    total += segmentMilliseconds(number, multiplier)

    if (!Number.isFinite(total)) {
      throw new InvalidTimeExpressionError(value, "value overflows the representable range")
    }

    prevEnd = match.index + match[0].length
    segmentCount += 1
  }

  if (segmentCount === 0) {
    throw new InvalidTimeExpressionError(value, "value is not a valid time expression")
  }

  // Bare numbers (no unit) are only valid as single expressions — in compound
  // expressions every segment must include a unit.
  if (segmentCount > 1 && hasBareSegment) {
    throw new InvalidTimeExpressionError(
      value,
      "every segment in a compound expression must have a unit"
    )
  }

  const trailing = body.slice(prevEnd)
  if (!WHITESPACE_RE.test(trailing)) {
    throw new InvalidTimeExpressionError(value, "value is not a valid time expression")
  }

  return { isBare: hasBareSegment, milliseconds: toDuration(sign * total) }
}

/**
 * Parse a time expression string into milliseconds without throwing.
 *
 * @example
 *   safeParse("1h 30m") // 5_400_000
 *   safeParse("hello") // null
 *
 * @param value - A time expression string to parse
 *
 * @returns The total value in milliseconds, or `null` if the input is not a valid time expression
 */
export function safeParse(value: string): Duration<"milliseconds"> | null {
  try {
    return parse(value)
  } catch {
    return null
  }
}

/**
 * Multiplies a decimal number by a unit's milliseconds, rounding once. `"1.1h"` is 11 tenths of an
 * hour, so the result is `11 * 3_600_000 / 10`, exactly 3_960_000. Multiplying the parsed float
 * instead rounds twice, and `1.1 * 3_600_000` is 3_960_000.0000000005. A number with too many
 * digits for one rounding falls back to the float product.
 */
function segmentMilliseconds(number: string, multiplier: number): number {
  const parts = NUMBER_PARTS_RE.exec(number)
  const whole = parts?.[1] ?? ""
  const fraction = parts?.[2] ?? ""
  const exponent = Number(parts?.[3] ?? 0) - fraction.length
  const scaled = Number(whole + fraction) * multiplier

  if (!Number.isSafeInteger(scaled) || Math.abs(exponent) > MAX_EXACT_POWER_OF_TEN) {
    return Number.parseFloat(number) * multiplier
  }

  return exponent < 0 ? scaled / 10 ** -exponent : scaled * 10 ** exponent
}
