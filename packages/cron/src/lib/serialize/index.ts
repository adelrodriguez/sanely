import type { CronFieldName, Fields } from "#lib/fields/index.ts"
import type { CronExpression } from "#lib/schedule/index.ts"
import { FIELD_RANGES } from "#lib/fields/index.ts"

const FIELD_ORDER: readonly CronFieldName[] = ["minute", "hour", "dayOfMonth", "month", "dayOfWeek"]

// The step `s` when the values are exactly `start, start + s, start + 2s, ...` to the end of the
// field, and `s` divides the length of the field.
function findStep(values: readonly number[], start: number, end: number): number | undefined {
  const [first, second] = values
  if (first !== start || second === undefined) return undefined

  const step = second - first
  const length = end - start + 1
  if (step < 2 || length % step !== 0 || values.length !== length / step) return undefined

  return values.every((value, index) => value === start + index * step) ? step : undefined
}

// Runs of three or more consecutive values become ranges (`1-5`). Shorter runs stay in a list.
function formatList(values: readonly number[]): string {
  const parts: string[] = []
  let index = 0

  while (index < values.length) {
    let last = index
    while (values[last + 1] === (values[last] ?? 0) + 1) last += 1

    if (last - index >= 2) {
      parts.push(`${values[index]}-${values[last]}`)
    } else {
      parts.push(...values.slice(index, last + 1).map(String))
    }

    index = last + 1
  }

  return parts.join(",")
}

function formatField(field: CronFieldName, values: readonly number[]): string {
  const [start, end] = FIELD_RANGES[field]
  if (values.length === end - start + 1) return "*"

  const step = findStep(values, start, end)
  if (step !== undefined) return `*/${step}`

  return formatList(values)
}

/**
 * Serialize the cron fields to a standard 5-field cron expression.
 */
export function serialize(fields: Fields): CronExpression {
  // The serializer is the only source of the brand: each result is a cron expression.
  return FIELD_ORDER.map((field) => formatField(field, fields[field])).join(" ") as CronExpression
}
