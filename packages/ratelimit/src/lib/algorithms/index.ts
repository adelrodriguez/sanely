import type { ValidateTimeExpression } from "@sanely/duration"
import { InvalidOptionError, milliseconds, positiveInteger } from "#lib/options/index.ts"

// Every store sets an expiry up to two periods after now, and computes it in floating point. A
// period of at most 2^50 ms (about 35,000 years) keeps that time a safe integer for every date
// before the year 200,000. Redis rejects an expiry that is not an integer, after the script has
// already written the state, so the state would never expire.
const MAX_PERIOD = 2 ** 50

function period(option: string, value: number | string) {
  const parsed = milliseconds(option, value)

  if (parsed > MAX_PERIOD) {
    throw new InvalidOptionError(option, value, `at most ${MAX_PERIOD} ms`)
  }

  return parsed
}

declare const checked: unique symbol

// Only `fixedWindow`, `slidingWindow`, and `tokenBucket` add this brand, after they check their
// options, so the type checker rejects an algorithm written as an object literal.
type Checked = { readonly [checked]: true }

/**
 * Allows `limit` units in each window. Windows start at multiples of `window` since the epoch.
 */
export type FixedWindow = Checked & {
  readonly type: "fixedWindow"
  readonly limit: number
  readonly window: number
}

/**
 * Allows `limit` units in any period of `window`, weighting the previous window by its overlap.
 */
export type SlidingWindow = Checked & {
  readonly type: "slidingWindow"
  readonly limit: number
  readonly window: number
}

/**
 * Holds up to `capacity` tokens and adds `refillRate` tokens every `interval`.
 */
export type TokenBucket = Checked & {
  readonly type: "tokenBucket"
  readonly refillRate: number
  readonly interval: number
  readonly capacity: number
}

export type Algorithm = FixedWindow | SlidingWindow | TokenBucket

export type WindowOptions<T extends string = never> = {
  /**
   * The most units in one window.
   */
  readonly limit: number
  /**
   * The window length in milliseconds, or a time expression such as `"1h"`.
   */
  readonly window: number | ValidateTimeExpression<T>
}

export type TokenBucketOptions<T extends string = never> = {
  /**
   * The tokens added every `interval`.
   */
  readonly refillRate: number
  /**
   * The time between refills in milliseconds, or a time expression such as `"1m"`.
   */
  readonly interval: number | ValidateTimeExpression<T>
  /**
   * The most tokens the bucket holds. A new bucket starts full.
   */
  readonly capacity: number
}

export function fixedWindow<const T extends string = never>({
  limit,
  window,
}: WindowOptions<T>): FixedWindow {
  return {
    limit: positiveInteger("limit", limit),
    type: "fixedWindow",
    window: period("window", window),
  } as FixedWindow
}

export function slidingWindow<const T extends string = never>({
  limit,
  window,
}: WindowOptions<T>): SlidingWindow {
  return {
    limit: positiveInteger("limit", limit),
    type: "slidingWindow",
    window: period("window", window),
  } as SlidingWindow
}

export function tokenBucket<const T extends string = never>({
  refillRate,
  interval,
  capacity,
}: TokenBucketOptions<T>): TokenBucket {
  const bucket = {
    capacity: positiveInteger("capacity", capacity),
    interval: period("interval", interval),
    refillRate: positiveInteger("refillRate", refillRate),
    type: "tokenBucket",
  } as TokenBucket

  if (windowOf(bucket) > MAX_PERIOD) {
    throw new InvalidOptionError(
      "interval",
      interval,
      `short enough that a full refill takes at most ${MAX_PERIOD} ms`
    )
  }

  return bucket
}

/**
 * The most units one identity can spend at once.
 */
export function capacityOf(algorithm: Algorithm) {
  return algorithm.type === "tokenBucket" ? algorithm.capacity : algorithm.limit
}

/**
 * The period the limit covers in milliseconds. A token bucket refills completely in this time.
 */
export function windowOf(algorithm: Algorithm) {
  return algorithm.type === "tokenBucket"
    ? Math.ceil(algorithm.capacity / algorithm.refillRate) * algorithm.interval
    : algorithm.window
}
