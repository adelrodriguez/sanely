---
"@sanely/try": patch
---

Treat a `TimeoutError` or `CancellationError` that `try` rethrows from a nested call as an ordinary failure

`run` and `runSync` used to return such an error without retrying it or passing it to `catch`, even when the call had no `timeout` or `signal` and its type left the error out. Only the call's own deadline and signal now produce policy failures, as in `all`.
