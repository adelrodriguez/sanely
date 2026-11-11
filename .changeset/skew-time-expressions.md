---
"@sanely/skew": minor
---

Accept time expressions such as `"5m"` for `checkInterval` and `checkTimeout`

`useDeploymentStatus({ checkInterval: "5m" })` is the same as `checkInterval: 300_000`, and `createDeploymentMonitor(source, { checkTimeout: "10s" })` is the same as `checkTimeout: 10_000`. The type checker checks a literal expression with `@sanely/duration`, so `"1M"` fails to compile with the reason. A string from config needs `isTimeExpression` from `@sanely/duration` first. `createDeploymentMonitor`, `subscribe`, and `useDeploymentStatus` throw `InvalidTimeExpressionError` for a string that is not a time expression.

`@sanely/skew` now depends on `@sanely/duration`.
