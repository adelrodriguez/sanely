---
"@sanely/ratelimit": minor
---

Reject algorithms written as object literals

`FixedWindow`, `SlidingWindow`, and `TokenBucket` now carry a type brand that only `fixedWindow`, `slidingWindow`, and `tokenBucket` add, after they check their options. An object literal such as `{ type: "fixedWindow", limit: 10, window: 0 }` no longer compiles as an algorithm, because it skipped those checks and could produce resets that are not numbers and denials that never expire. Build each algorithm with its function instead.
