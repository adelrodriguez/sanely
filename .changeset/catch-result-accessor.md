---
"@sanely/try": patch
---

Read earlier task results in an orchestration `catch` with `ctx.result(task)`

`ctx.partial` is replaced by `ctx.result(task)`, which returns the result of a task that succeeded before the failure, or `undefined`. A `catch` that returned values from `ctx.partial` made TypeScript infer `any` for a task that returned a value read through `this`, and `flow` resolved as `unknown`. The accessor keeps every task result typed.
