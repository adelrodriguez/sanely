---
"@sanely/skew": minor
---

Accept time expressions such as `"5m"` for `checkInterval` and `checkTimeout`

`createDeploymentMonitor({ checkInterval: "5m", checkTimeout: "10s" })` is the same as `checkInterval: 300_000, checkTimeout: 10_000`. The type checker checks a literal expression with `@sanely/duration`, so `"1M"` fails to compile with the reason. A string from config needs `isTimeExpression` from `@sanely/duration` first.

`@sanely/skew` now depends on `@sanely/duration`.
