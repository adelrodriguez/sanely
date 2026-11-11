---
"@sanely/try": minor
---

Throw a `Panic` when a task cleanup fails in `all`, `allSettled`, or `flow`

A cleanup on `this.$disposer` that throws or rejects used to make the call reject with the raw error, although an orchestration call otherwise rejects only with a `Panic`. The call now runs the rest of the cleanup, then throws a `Panic` with the code `TASK_CLEANUP_THROW`. The `cause` is the cleanup error. When this call's own deadline or signal fired, or a task failure stopped the graph, even one that `catch` mapped, the `cause` is a `SuppressedError` that keeps both errors. A `Panic` from a task or from `catch` still wins.

To keep a cleanup that can fail from throwing, catch its error inside the cleanup.
