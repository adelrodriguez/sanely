import type { ValidateTimeExpression } from "@sanely/duration"
import { FlagDefinitionError } from "#lib/errors/index.ts"
import { milliseconds } from "#lib/shared/utils.ts"

/**
 * The defaults of `FlagCacheOptions`. docs/reference.md states them, and a test compares the two.
 */
export const DEFAULT_MAX_ENTRIES = 100
export const DEFAULT_TTL = 5 * 60 * 1000

export type FlagCacheOptions<T extends string = never> = {
  /**
   * The most settled entries for each list of flags, one for each identity. Pending entries do not
   * count. Defaults to 100.
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

/**
 * The cache options before parsing. A time option is a number or any string, which `lengthOfTime`
 * parses.
 */
export type CacheInput = {
  maxEntries?: number
  pendingTtl?: number | string
  ttl?: number | string
}

function lengthOfTime(option: string, value: unknown): number {
  const parsed = milliseconds(value)
  if (parsed === null || !Number.isFinite(parsed) || parsed <= 0) {
    throw new FlagDefinitionError(
      `${option} must be a time expression or a positive finite number of milliseconds`
    )
  }
  return parsed
}

export function readCacheOptions(options: CacheInput) {
  const { maxEntries = DEFAULT_MAX_ENTRIES, pendingTtl, ttl = DEFAULT_TTL } = options
  if (!Number.isFinite(maxEntries) || maxEntries <= 0 || !Number.isInteger(maxEntries)) {
    throw new FlagDefinitionError("maxEntries must be a positive finite integer")
  }
  return {
    maxEntries,
    pendingTtl: pendingTtl === undefined ? undefined : lengthOfTime("pendingTtl", pendingTtl),
    ttl: lengthOfTime("ttl", ttl),
  }
}
