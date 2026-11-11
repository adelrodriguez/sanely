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

const nativeDispose: unknown = Reflect.get(Symbol, "dispose")

// The key that `using` reads. A runtime without `Symbol.dispose` gets the symbol that TypeScript's
// `using` helper falls back to.
const DISPOSE = typeof nativeDispose === "symbol" ? nativeDispose : Symbol.for("Symbol.dispose")

/**
 * Makes `target` work with `using` by calling `dispose` under the key that `using` reads.
 */
export function disposable<TTarget extends object>(
  target: TTarget,
  dispose: () => void
): TTarget & Disposable {
  Object.defineProperty(target, DISPOSE, { enumerable: true, value: dispose })
  // The property was just defined under the key that `using` reads, which the type cannot see.
  return target as TTarget & Disposable
}
