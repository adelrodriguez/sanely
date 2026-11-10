---
"@sanely/try": patch
---

Fix three cases where a mistake passed the type checker and failed at runtime

- Every context passed to user code is read-only: `try`, `shouldRetry`, task `this`, and the `catch` context of `all` and `flow`. Writing `ctx.retry.attempt` no longer changes how many attempts run.
- `timeout(a).timeout(b)` keeps the tighter deadline instead of the last one.
- `$exit` ends the flow when it is called, even if the task catches what it throws or calls it inside a nested `run`.
