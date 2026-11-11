---
"@sanely/ratelimit": minor
---

Accept time expressions such as `"1h"` for `window`, `interval`, and `timeout`

`fixedWindow({ limit: 100, window: "1m" })` is the same as `window: 60_000`. The type checker checks a literal expression with `@sanely/duration`, so `"1M"` fails to compile with the reason. A string from config needs `isTimeExpression` from `@sanely/duration` first. An expression that is not a whole positive number of milliseconds throws `InvalidOptionError` with the string as `value`.

`@sanely/ratelimit` now depends on `@sanely/duration`.
