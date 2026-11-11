---
"@sanely/try": minor
---

Accept time expressions such as `"500ms"` for retry delays and timeouts, and drop the `Ms` suffix from the retry options

`retry({ backoff: "exponential", delay: "200ms", maxDelay: "2s", limit: 4 })` is the same as `delay: 200, maxDelay: 2000`, and `timeout("5s")` is the same as `timeout(5000)`. The type checker checks a literal expression with `@sanely/duration`, so `"1M"` fails to compile with the reason. A string from config needs `isTimeExpression` from `@sanely/duration` first. A string that is not a time expression throws a `Panic` with the code `RETRY_INVALID_DELAY` from `retry` and `retryOptions`, or `TIMEOUT_INVALID_MS` from `timeout`. `retryOptions` still returns `delay` and `maxDelay` in milliseconds.

To migrate, rename `delayMs` to `delay` and `maxDelayMs` to `maxDelay` in every retry policy. The old names no longer compile, and `retry` ignores them at run time, so untyped code that keeps them retries without a delay. Code that reads `delayMs` or `maxDelayMs` from the result of `retryOptions` reads `delay` and `maxDelay` instead.

`@sanely/try` now depends on `@sanely/duration`.
