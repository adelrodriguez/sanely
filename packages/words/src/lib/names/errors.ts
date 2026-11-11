/**
 * Error thrown by `generate` and `count` when an option is invalid.
 *
 * @example
 *   import { generate, InvalidOptionError } from "@sanely/words"
 *
 *   try {
 *     generate({ separator: "" })
 *   } catch (error) {
 *     if (error instanceof InvalidOptionError) {
 *       console.error(error.option, error.value)
 *     }
 *   }
 */
export class InvalidOptionError extends Error {
  override readonly name = "InvalidOptionError"
  /**
   * The name of the invalid option, such as `"separator"` or `"pattern[1]"`.
   */
  readonly option: string
  /**
   * The invalid value.
   */
  readonly value: unknown

  constructor(option: string, value: unknown, expected: string) {
    super(`Expected ${option} to be ${expected}, received ${describe(value)}`)
    this.option = option
    this.value = value
  }
}

/**
 * Why `generate` could not build a name.
 *
 * - `"unique"`: the lists hold too few distinct words for the pattern, after `omit`.
 * - `"maxLength"`: no name from the lists fits within `maxLength`.
 */
export type NotEnoughWordsReason = "maxLength" | "unique"

/**
 * Error thrown by `generate` when no name satisfies the options.
 *
 * @example
 *   import { generate, NotEnoughWordsError } from "@sanely/words"
 *
 *   try {
 *     generate({ maxLength: 4 })
 *   } catch (error) {
 *     if (error instanceof NotEnoughWordsError) {
 *       error.reason // "maxLength"
 *     }
 *   }
 */
export class NotEnoughWordsError extends Error {
  override readonly name = "NotEnoughWordsError"
  readonly reason: NotEnoughWordsReason

  constructor(reason: NotEnoughWordsReason) {
    super(messages[reason])
    this.reason = reason
  }
}

const messages: Record<NotEnoughWordsReason, string> = {
  maxLength: "No name from the word lists fits within maxLength",
  unique: "The word lists hold too few distinct words for the pattern",
}

function describe(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value)
  if (Array.isArray(value)) return "an array"
  if (typeof value === "function") return "a function"
  return String(value)
}
