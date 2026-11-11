import type { ValidateTimeExpression } from "@sanely/duration"

export * from "./key"

export type FlagCacheOptions<T extends string = never> = {
  /**
   * Maximum number of identities retained by the cache. Defaults to 100.
   */
  maxEntries?: number
  /**
   * How long a pending evaluation lasts before it can be evicted, in milliseconds or as a time
   * expression such as `"30s"`. Disabled by default.
   */
  pendingTtl?: number | ValidateTimeExpression<T>
  /**
   * How long an evaluation stays cached, in milliseconds or as a time expression such as `"5m"`.
   * Defaults to five minutes.
   */
  ttl?: number | ValidateTimeExpression<T>
}

export async function evictOnRejection<T>(
  evaluation: Promise<T>,
  onRejected: () => void
): Promise<T> {
  try {
    return await evaluation
  } catch (error) {
    onRejected()
    throw error
  }
}
