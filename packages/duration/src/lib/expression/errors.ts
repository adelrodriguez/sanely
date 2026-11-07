function describe(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value)
  return String(value)
}

/**
 * Error thrown by `parse` (and the functions built on it) when the input is not a valid time
 * expression.
 *
 * @example
 *   import { parse, InvalidTimeExpressionError } from "@sanely/duration"
 *
 *   try {
 *     parse(userInput)
 *   } catch (error) {
 *     if (error instanceof InvalidTimeExpressionError) {
 *       console.error(error.message, error.value)
 *     }
 *   }
 */
export class InvalidTimeExpressionError extends Error {
  /**
   * The invalid input value.
   */
  readonly value: unknown

  constructor(value: unknown, reason: string) {
    super(`Invalid time expression: ${reason}. Received: ${describe(value)}`)
    this.name = "InvalidTimeExpressionError"
    this.value = value
  }
}
