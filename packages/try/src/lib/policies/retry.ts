import { Panic } from "#lib/shared/errors.ts"
import { assertUnreachable, invariant } from "#lib/shared/utils.ts"
import type { BuilderConfig, RetryOptions, RetryPolicy, TryCtx } from "./options.ts"

function checkIsValidDelay(ms: number) {
  return Number.isFinite(ms) && ms >= 0
}

export function retryOptions(policy: RetryOptions): RetryPolicy {
  const limit = typeof policy === "number" ? policy : policy.limit

  invariant(Number.isInteger(limit), new Panic("RETRY_INVALID_LIMIT"))
  invariant(limit >= 1, new Panic("RETRY_INVALID_LIMIT"))

  if (typeof policy === "number") {
    return {
      backoff: "constant",
      delayMs: 0,
      limit: policy,
    }
  }

  invariant(checkIsValidDelay(policy.delayMs ?? 0), new Panic("RETRY_INVALID_DELAY"))
  invariant(checkIsValidDelay(policy.maxDelayMs ?? 0), new Panic("RETRY_INVALID_DELAY"))

  const base = {
    delayMs: policy.delayMs ?? 0,
    jitter: policy.jitter,
    limit: policy.limit,
    shouldRetry: policy.shouldRetry,
  }

  switch (policy.backoff) {
    case "constant":
    case "linear":
      return { ...base, backoff: policy.backoff }
    case "exponential":
      return { ...base, backoff: policy.backoff, maxDelayMs: policy.maxDelayMs }
    default:
      return assertUnreachable(policy, "UNREACHABLE_RETRY_POLICY_BACKOFF")
  }
}

/**
 * How many times `delayMs` each backoff waits after attempt `n`. Every backoff scales `delayMs`, so
 * a policy without a delay never waits, whatever its backoff or jitter. A new backoff kind does not
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
export type SyncRetryOptions = number | (RetryPolicy & { readonly delayMs?: 0 })

export function checkIsSyncRetryPolicy(policy: RetryPolicy) {
  return (policy.delayMs ?? 0) === 0
}

export function calculateRetryDelay(attempt: number, config: BuilderConfig): number {
  const policy = config.retry

  if (!policy) {
    return 0
  }

  // Without maxDelayMs, cap the delay at the largest safe integer, so a growing backoff stays finite
  // and jitter never multiplies an infinite delay.
  const delay = Math.min(
    (policy.delayMs ?? 0) * backoffGrowth[policy.backoff](attempt),
    policy.maxDelayMs ?? Number.MAX_SAFE_INTEGER
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
