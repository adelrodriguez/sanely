import type { Path } from "#lib/schedule/rules.ts"
import { ParseError, show } from "#lib/schedule/rules.ts"

// A path such as `["on", 2]` as `on[2]`, and `["at", "hour"]` as `at.hour`.
function formatPath(path: Path): string {
  return path
    .map((key, index) => {
      if (typeof key === "number") return `[${key}]`
      return index === 0 ? key : `.${key}`
    })
    .join("")
}

/**
 * Error thrown when an input is not a valid schedule: a cron phrase that the language does not
 * contain, or a schedule object with a value that one cron expression cannot express exactly.
 *
 * @example
 *   import { InvalidScheduleError, parse } from "@sanely/cron"
 *
 *   try {
 *     parse(form.schedule)
 *   } catch (error) {
 *     if (error instanceof InvalidScheduleError) console.error(error.reason, error.path)
 *   }
 */
export class InvalidScheduleError extends Error {
  override readonly name: "InvalidScheduleError"

  /**
   * The input, without a change.
   */
  readonly value: unknown

  /**
   * Why the input is not valid, such as `7 does not divide 60. Use 2, 3, 4, 5, 6, 10, 12, 15, 20,
   * or 30`. For a cron phrase, it is the same text as the type error.
   */
  readonly reason: string

  /**
   * The keys from the root of a schedule object to the value that failed, such as `["at", "hour"]`.
   * It is empty for a cron phrase, and for an object that fails as a whole.
   */
  readonly path: Path

  constructor(value: unknown, reason: string, path: Path = []) {
    const where = path.length === 0 ? "" : ` at "${formatPath(path)}"`
    super(`Invalid schedule${where}: ${reason}. Received: ${show(value)}`)
    this.name = "InvalidScheduleError"
    this.value = value
    this.reason = reason
    this.path = path
  }
}

/**
 * Run a parse step, and change a `ParseError` to an `InvalidScheduleError` for the input.
 */
export function withInput<T>(value: unknown, step: () => T): T {
  try {
    return step()
  } catch (error) {
    if (error instanceof ParseError) throw new InvalidScheduleError(value, error.reason, error.path)
    throw error
  }
}
