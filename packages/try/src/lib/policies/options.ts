interface RetryInfo {
  readonly attempt: number
  readonly limit: number
}

/**
 * The execution context. It is a read-only view: the execution owns the attempt count, and code
 * that receives the context can read it but not change it.
 */
export interface BaseTryCtx {
  readonly signal?: AbortSignal
}

export type TryCtxFor<HasRetry extends boolean> = HasRetry extends true
  ? BaseTryCtx & { readonly retry: RetryInfo }
  : BaseTryCtx

export type TryCtx = TryCtxFor<true>

/**
 * Wraps are observational hooks: they can inspect execution context and surround execution, but
 * they must not mutate context or replace it.
 */
export type WrapCtx = TryCtx

export type WrapFn = (ctx: WrapCtx, next: () => unknown) => unknown

export interface BuilderConfig {
  /**
   * Retry configuration applied to the run.
   */
  retry?: RetryPolicy
  /**
   * Timeout configuration applied to the run.
   */
  timeout?: number
  /**
   * Abort signals used to cancel execution.
   */
  signals?: AbortSignal[]
  /**
   * Wrapper middleware chain around execution.
   */
  wraps?: WrapFn[]
}

interface BaseRetryPolicy {
  /**
   * Maximum number of attempts, including the first run.
   */
  limit: number
  /**
   * Delay in milliseconds between attempts. Defaults to 0.
   */
  delayMs?: number
  /**
   * Adds random jitter to delays when enabled.
   */
  jitter?: boolean
  /**
   * Return true to retry after an error, false to stop.
   */
  shouldRetry?: (error: unknown, ctx: TryCtx) => boolean
}

interface LinearBackoffRetryPolicy extends BaseRetryPolicy {
  /**
   * Use linearly increasing delay between attempts.
   */
  backoff: "linear"
  /**
   * Not supported for linear backoff.
   */
  maxDelayMs?: never
}

interface ExponentialBackoffRetryPolicy extends BaseRetryPolicy {
  /**
   * Use exponential delay growth between attempts.
   */
  backoff: "exponential"
  /**
   * Optional cap for exponential delay in milliseconds.
   */
  maxDelayMs?: number
}

/**
 * Retry policy using a constant delay strategy.
 */
interface ConstantBackoffRetryPolicy extends BaseRetryPolicy {
  /**
   * Required discriminant: use a fixed delay between attempts.
   */
  backoff: "constant"
  /**
   * Not supported for constant backoff.
   */
  maxDelayMs?: never
}

/**
 * Retry configuration object.
 */
export type RetryPolicy =
  | LinearBackoffRetryPolicy
  | ExponentialBackoffRetryPolicy
  | ConstantBackoffRetryPolicy

/**
 * Retry shorthand or full retry configuration.
 *
 * - `number`: attempt limit
 * - `RetryPolicy`: detailed retry settings
 */
export type RetryOptions = number | RetryPolicy

declare const INVALID_RETRY_LIMIT: unique symbol
type InvalidRetryLimit = {
  readonly [INVALID_RETRY_LIMIT]: "retry() requires a positive integer limit"
}

/**
 * Compile-time validation for literal retry limits. Rejects `0`, negative, and fractional literals;
 * non-literal `number` values pass and are validated at runtime by {@link retryOptions} instead.
 * (`Infinity`/`NaN` have no literal types, so they are runtime-only.)
 */
export type ValidateRetryLimit<N extends number> = number extends N
  ? number
  : `${N}` extends `-${string}` | `${string}.${string}`
    ? InvalidRetryLimit
    : N extends 0
      ? InvalidRetryLimit
      : number

/**
 * Compile-time validation for full {@link RetryOptions} values, including unions of number and
 * policy forms. Distributes over union members so that mixed inputs like `flag ? 3 : { backoff:
 * "constant", limit: 5 }` are accepted while any member carrying an invalid literal limit still
 * fails to compile.
 */
export type ValidateRetryOptions<P extends RetryOptions> = P extends number
  ? ValidateRetryLimit<P>
  : P extends { limit: infer N extends number }
    ? { limit: ValidateRetryLimit<N> }
    : never
