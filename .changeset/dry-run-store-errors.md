---
"@sanely/ratelimit": minor
---

Keep a dry-run limiter's store error from stopping a chain of limiters

When the store failed for a dry-run limiter, `rateLimit` returned that store error and skipped the enforced limiters after it. A dry-run limiter's store error now stays in `results`, and the chain goes on. It is the result only when no limiter allowed the request. `StoreErrorResult` now has `mode`, so middleware can tell a trial limiter's store error from an enforced one.
