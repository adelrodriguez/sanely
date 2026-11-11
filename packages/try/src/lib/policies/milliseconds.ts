import { safeParse } from "@sanely/duration"
import { Panic, type PanicCode } from "#lib/shared/errors.ts"
import { invariant } from "#lib/shared/utils.ts"

/**
 * Reads a length of time given in milliseconds or as a time expression, such as `"5s"`. Throws a
 * {@link Panic} with `code` for a string that is not a time expression, and for a length that is
 * negative or not finite.
 */
export function milliseconds(value: number | string, code: PanicCode): number {
  const parsed = typeof value === "number" ? value : safeParse(value)

  invariant(parsed !== null && Number.isFinite(parsed) && parsed >= 0, new Panic(code))

  return parsed
}
