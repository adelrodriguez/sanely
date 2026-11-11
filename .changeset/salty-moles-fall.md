---
"@sanely/ratelimit": patch
---

Fix the Redis stores reading another algorithm's counts after a limiter changes algorithm

The Redis, Valkey, and Bun Redis stores now count state that another algorithm wrote as no state, as the memory store does. A state written by an earlier version counts as no state once, on its first request after the upgrade.
