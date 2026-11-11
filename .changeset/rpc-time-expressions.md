---
"@sanely/rpc": minor
---

Accept time expressions such as `"5s"` for the `connect` timeout, and drop the `Ms` suffix from its name

`connect(wire, { timeout: "5s" })` is the same as `timeout: 5000`, and `timeout: Infinity` still turns the timeout off. The type checker checks a literal expression with `@sanely/duration`, so `"1M"` fails to compile with the reason. A string from config needs `isTimeExpression` from `@sanely/duration` first. `connect` throws a `SetupError` with the code `invalid-timeout` for a string that is not a time expression.

To migrate, rename the `connect` option `timeoutMs` to `timeout`. The `timeout` `ChannelError`'s `timeoutMs` field is now `timeout`, and it still holds milliseconds. A peer on an older version sends a `timeout` error with `timeoutMs`, which this version does not read, so upgrade both ends of a `connect` together.

`@sanely/rpc` now depends on `@sanely/duration`.
