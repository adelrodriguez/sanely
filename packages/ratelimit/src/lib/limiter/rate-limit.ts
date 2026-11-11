import { InvalidOptionError } from "#lib/options/index.ts"
import type { LimitResult, Limiter, Remaining } from "./build-limiter.ts"
import { internal } from "./build-limiter.ts"

export type RateLimitOptions = {
  /**
   * The units this request spends: an integer from 1 to each limiter's capacity. Defaults to 1.
   */
  readonly cost?: number
}

/**
 * The result that decided, and every limiter's own result in order.
 */
export type LimitResults = LimitResult & { readonly results: readonly LimitResult[] }

type Limiters<Input> = readonly [Limiter<Input>, ...Array<Limiter<Input>>]

/**
 * Spends `cost` units. With several limiters, it runs them in order and stops at the first denial
 * or enforced store error. The result is that denial or store error, or otherwise the allowed
 * result with the fewest units remaining. An enforced limiter's result decides before a dry-run
 * limiter's, so a trial limit never replaces the headers of an enforced one. A dry-run limiter's
 * store error does not stop the chain, and it decides only when no limiter allowed the request.
 *
 * It does not reject when the store fails: the result is a store error, which is never a success.
 */
export function rateLimit<Input>(
  limiter: Limiter<Input>,
  input: Input,
  options?: RateLimitOptions
): Promise<LimitResult>
export function rateLimit<Input>(
  limiters: Limiters<Input>,
  input: Input,
  options?: RateLimitOptions
): Promise<LimitResults>
export async function rateLimit<Input>(
  limiters: Limiter<Input> | Limiters<Input>,
  input: Input,
  { cost = 1 }: RateLimitOptions = {}
): Promise<LimitResult | LimitResults> {
  if (internal in limiters) {
    checkCost(limiters, cost)
    const key = await limiters[internal].key(input)
    return limiters[internal].blocked(key, cost) ?? limiters[internal].consume(key, cost)
  }

  // Check every cost first, so an invalid cost spends nothing.
  for (const limiter of limiters) checkCost(limiter, cost)

  // Check every remembered denial next, so a limiter that is blocked in this process stops the
  // request before an earlier limiter spends.
  const [first, ...rest] = limiters
  const firstKey = await first[internal].key(input)
  const firstBlocked = first[internal].blocked(firstKey, cost)

  if (firstBlocked !== undefined) return { ...firstBlocked, results: [firstBlocked] }

  const others: Array<readonly [Limiter<Input>, string]> = []

  for (const limiter of rest) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- A remembered denial stops later limiters from running identify.
    const key = await limiter[internal].key(input)
    const blocked = limiter[internal].blocked(key, cost)

    if (blocked !== undefined) return { ...blocked, results: [blocked] }

    others.push([limiter, key])
  }

  // A denial can be remembered while an earlier limiter waits for the store, so check again just
  // before each store call.
  const head =
    first[internal].blocked(firstKey, cost) ?? (await first[internal].consume(firstKey, cost))
  const results = [head]

  if (stops(head)) return { ...head, results }

  let decision = head

  for (const [limiter, key] of others) {
    const blocked = limiter[internal].blocked(key, cost)
    // oxlint-disable-next-line eslint/no-await-in-loop -- Limiters run in order, so a denial stops later limiters from spending.
    const result = blocked ?? (await limiter[internal].consume(key, cost))
    results.push(result)

    if (stops(result)) return { ...result, results }
    if (decidesBefore(result, decision)) decision = result
  }

  return { ...decision, results }
}

// A denial or an enforced store error stops the chain. A dry-run limiter's store error does not.
function stops(result: LimitResult) {
  return result.reason === "storeError" ? result.mode === "enforce" : !result.success
}

// Among results that do not stop the chain, an allowed result decides before a dry-run store error,
// an enforced result before a dry-run one, and then the result with the fewest units remaining.
function decidesBefore(result: LimitResult, current: LimitResult) {
  if (!result.success) return false
  if (!current.success) return true

  return result.mode === current.mode
    ? result.remaining < current.remaining
    : result.mode === "enforce"
}

/**
 * Reads the units left without spending any. Rejects with `StoreError` when the store fails.
 */
export function remaining<Input>(limiter: Limiter<Input>, input: Input): Promise<Remaining> {
  return limiter[internal].read(input)
}

/**
 * Restores every unit. Rejects with `StoreError` when the store fails.
 */
export function clear<Input>(limiter: Limiter<Input>, input: Input): Promise<void> {
  return limiter[internal].clear(input)
}

function checkCost<Input>(limiter: Limiter<Input>, cost: number) {
  const { capacity } = limiter[internal]

  if (!Number.isSafeInteger(cost) || cost < 1 || cost > capacity) {
    throw new InvalidOptionError("cost", cost, `an integer from 1 to ${capacity}`)
  }
}
