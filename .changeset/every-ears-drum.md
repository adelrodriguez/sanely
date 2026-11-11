---
"@sanely/try": patch
---

Report a cleanup callback that throws `undefined`

`disposer().dispose()` now rejects with `undefined` when a cleanup callback throws `undefined`, as native `AsyncDisposableStack` does. It used to resolve as if every cleanup succeeded, and a later cleanup failure lost the earlier one instead of keeping it as the `suppressed` error of a `SuppressedError`. The same fix applies to `this.$disposer` in `all`, `allSettled`, and `flow`.
