---
"@sanely/ratelimit": patch
---

Reject an invalid shared `timeout` when `buildLimiter` runs

`buildLimiter({ store, timeout: 0 })` returned a limiter factory and threw `InvalidOptionError` only when the factory defined a limiter. It now throws at once, as it does for an invalid `prefix`. A `timeout` set on a limiter is still checked when the factory defines that limiter.
