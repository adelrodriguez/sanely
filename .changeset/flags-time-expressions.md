---
"@sanely/flags": minor
---

Accept time expressions such as `"500ms"` for timeouts and cache lifetimes, and drop the `Ms` suffix from their names

`flag.boolean("checkout", false, { timeout: "300ms" })` is the same as `timeout: 300`, and `createFlags({ provider, timeout: "1s" })` is the same as `timeout: 1000`. `FlagsProvider` takes `cache={{ ttl: "5m", pendingTtl: "30s" }}`. The type checker checks a literal expression with `@sanely/duration`, so `"1M"` fails to compile with the reason. A string from config needs `isTimeExpression` from `@sanely/duration` first. `flag.boolean`, `flag.variant`, and `createFlags` throw `FlagDefinitionError` for a string that is not a time expression, and `FlagsProvider` throws `RangeError`.

To migrate, rename `timeoutMs` to `timeout`, `ttlMs` to `ttl`, and `pendingTtlMs` to `pendingTtl`. A flag definition's `timeoutMs` and `EvaluationTimeoutError`'s `timeoutMs` are now `timeout`, and they still hold milliseconds.

`@sanely/flags` now depends on `@sanely/duration`.
