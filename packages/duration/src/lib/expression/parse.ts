import { getUnitMs } from "@sanely/core/time"
import { InvalidTimeExpressionError } from "./errors"
import { LENIENT_UNIT_PATTERN, NUMBER_PATTERN } from "./grammar"

const MAX_LENGTH = 200

// Each segment is an unsigned number with an optional unit. Signs are handled once for the whole
// expression, before segment matching.
const SEGMENT_RE = new RegExp(`(${NUMBER_PATTERN})\\s*(${LENIENT_UNIT_PATTERN})?`, "gi")

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
export function parse(value: string): number {
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

    const numberToken = match[1] ?? ""
    const unitToken = match[2]

    // Without this check, "1h.5m" reads as "1h 0.5m".
    if (segmentCount > 0 && gap === "" && numberToken.startsWith(".")) {
      throw new InvalidTimeExpressionError(
        value,
        "a segment that follows another segment with no separator must start with a digit"
      )
    }

    if (!unitToken) {
      hasBareSegment = true
    }

    const n = Number.parseFloat(numberToken)
    const multiplier = unitToken ? getUnitMs(unitToken.toLowerCase()) : 1

    if (multiplier === undefined) {
      throw new InvalidTimeExpressionError(value, "value is not a valid time expression")
    }

    total += n * multiplier

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

  return sign * total
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
export function safeParse(value: string): number | null {
  try {
    return parse(value)
  } catch {
    return null
  }
}
