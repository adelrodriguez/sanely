function describe(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value)

  // Objects with a broken `toString` cannot become a string. The error must still be created.
  try {
    return String(value)
  } catch {
    return Object.prototype.toString.call(value)
  }
}

/**
 * Error thrown by `cron` and `parse` when the input is not a valid cron phrase.
 *
 * @example
 *   import { parse, InvalidCronPhraseError } from "@sanely/cron"
 *
 *   try {
 *     parse(userInput)
 *   } catch (error) {
 *     if (error instanceof InvalidCronPhraseError) {
 *       console.error(error.message, error.value)
 *     }
 *   }
 */
export class InvalidCronPhraseError extends Error {
  /**
   * The invalid input value.
   */
  readonly value: unknown

  constructor(value: unknown, reason: string) {
    super(`Invalid cron phrase: ${reason}. Received: ${describe(value)}`)
    this.name = "InvalidCronPhraseError"
    this.value = value
  }
}
