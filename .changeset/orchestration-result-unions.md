---
"@sanely/try": patch
---

Resolve `all`, `allSettled`, and `flow` failures as values, like `run`

Every terminal call now resolves with a result union and throws only a `Panic`. Before, the orchestration calls rejected, and their types did not show it.

- A task failure that `catch` does not map resolves as `UnhandledException`, with the failure as `cause`.
- The call's own `timeout` and `signal` resolve as `TimeoutError` and `CancellationError`, and the result type includes them.
- The `catch` of `all` receives the raw task failure, as in `run`.
- `flow(tasks, { catch })` maps a task failure with the same context as `all`.
- `flow` rejects a task that is not a function at compile time, as `all` does.
- The `catch` handler Panic codes are now `CATCH_HANDLER_THROW` and `CATCH_HANDLER_REJECT` for every API.

Check the result with `instanceof` instead of wrapping the call in `try`/`catch`. An orchestration call nested in `run` now returns its failure as a value, so throw it if the outer call should retry or map it.
