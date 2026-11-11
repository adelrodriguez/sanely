---
"@sanely/try": minor
---

Wait the full time for a deadline or retry delay above 24.8 days, and reject invalid retry delays

`timeout(Number.MAX_SAFE_INTEGER)` used to return a `TimeoutError` after about 1 ms, and a retry delay above 2,147,483,647 ms started the next attempt after about 1 ms, because `setTimeout` cannot hold a longer delay. Both now wait the full time. A growing exponential or linear backoff no longer drops to 1 ms once it passes that limit.

`retry` and `retryOptions` now throw a `Panic` with the code `RETRY_INVALID_DELAY` when `delayMs` or `maxDelayMs` is negative, `NaN`, or infinite. These values used to be accepted and behaved like a delay of 0 or 1 ms.
