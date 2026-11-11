import { safeParse } from "@sanely/duration"

/**
 * Reads a length of time given in milliseconds or as a time expression, such as `"5s"`. Returns
 * `null` for a string that is not a time expression and for a value that is neither. The caller
 * checks the range.
 */
export function milliseconds(value: unknown): number | null {
  if (typeof value === "number") return value
  return typeof value === "string" ? safeParse(value) : null
}

export function normalizeError(error: unknown): Error {
  try {
    if (error instanceof Error) {
      return error
    }

    if (typeof error === "object" && error !== null) {
      try {
        return new Error(JSON.stringify(error) || "Non-Error object thrown")
      } catch {
        return new Error("Non-Error object thrown")
      }
    }

    if (typeof error === "function") {
      return new Error("Non-Error function thrown")
    }

    return new Error(String(error))
  } catch {
    // Even inspecting a thrown value can fail (for example, a revoked Proxy throws from
    // `instanceof`). Error normalization must remain total to preserve fail-soft evaluation.
    return new Error("Uninspectable value thrown")
  }
}

export type MaybePromise<T> = T | Promise<T>
