import { Panic } from "#lib/shared/errors.ts"
import { assertUnreachable, invariant } from "#lib/shared/utils.ts"
import type { BuilderConfig, RetryOptions, RetryPolicy, TryCtx } from "./options.ts"
import { milliseconds } from "./milliseconds.ts"

/**
 * Reads a retry shorthand or policy into the policy that `retry` uses, with its delays in
 * milliseconds. Throws a {@link Panic} with the code `RETRY_INVALID_LIMIT` for an invalid limit,
 * and with the code `RETRY_INVALID_DELAY` for an invalid `delay` or `maxDelay`.
 */
export function retryOptions<const T extends string = never>(policy: RetryOptions<T>): RetryPolicy {
  const limit = typeof policy === "number" ? policy : policy.limit

  invariant(Number.isInteger(limit), new Panic("RETRY_INVALID_LIMIT"))
  invariant(limit >= 1, new Panic("RETRY_INVALID_LIMIT"))

  if (typeof policy === "number") {
    return {
      backoff: "constant",
      delay: 0,
      limit: policy,
    }
  }

  const base = {
    delay: milliseconds(policy.delay ?? 0, "RETRY_INVALID_DELAY"),
    jitter: policy.jitter,
    limit: policy.limit,
    shouldRetry: policy.shouldRetry,
  }
  // Only an exponential backoff keeps a cap, but an invalid one fails for every backoff.
  const maxDelay =
    policy.maxDelay === undefined ? undefined : milliseconds(policy.maxDelay, "RETRY_INVALID_DELAY")

  switch (policy.backoff) {
    case "constant":
    case "linear":
      return { ...base, backoff: policy.backoff }
    case "exponential":
      return { ...base, backoff: policy.backoff, maxDelay }
    default:
      return assertUnreachable(policy, "UNREACHABLE_RETRY_POLICY_BACKOFF")
  }
}

/**
 * How many times `delay` each backoff waits after attempt `n`. Every backoff scales `delay`, so a
 * policy without a delay never waits, whatever its backoff or jitter. A new backoff kind does not
 * compile until it has an entry here.
 */
const backoffGrowth: Record<RetryPolicy["backoff"], (attempt: number) => number> = {
  constant: () => 1,
  exponential: (attempt) => 2 ** (attempt - 1),
  linear: (attempt) => attempt,
}

/**
 * The retry options that `runSync` accepts: the ones that never wait between attempts. That is the
 * number form, or a policy without a delay. {@link checkIsSyncRetryPolicy} applies the same rule to
 * a policy at run time.
 */
export type SyncRetryOptions = number | (RetryPolicy & { readonly delay?: 0 })

export function checkIsSyncRetryPolicy(policy: RetryPolicy) {
  return (policy.delay ?? 0) === 0
}

export function calculateRetryDelay(attempt: number, config: BuilderConfig): number {
  const policy = config.retry

  if (!policy) {
    return 0
  }

  // Without maxDelay, cap the delay at the largest safe integer, so a growing backoff stays finite
  // and jitter never multiplies an infinite delay.
  const delay = Math.min(
    (policy.delay ?? 0) * backoffGrowth[policy.backoff](attempt),
    policy.maxDelay ?? Number.MAX_SAFE_INTEGER
  )

  if (!policy.jitter || delay <= 0) {
    return delay
  }

  return Math.floor(Math.random() * delay)
}

export function checkShouldAttemptRetry(
  error: unknown,
  ctx: TryCtx,
  config: BuilderConfig
): boolean {
  const policy = config.retry

  if (!policy) {
    return false
  }

  if (ctx.retry.attempt >= policy.limit) {
    return false
  }

  if (!policy.shouldRetry) {
    return true
  }

  return policy.shouldRetry(error, ctx)
}
