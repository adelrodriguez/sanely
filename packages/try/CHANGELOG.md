# @sanely/try

## 0.1.0

### Minor Changes

- ceb31b0: Wait the full time for a deadline or retry delay above 24.8 days, and reject invalid retry delays

  `timeout(Number.MAX_SAFE_INTEGER)` used to return a `TimeoutError` after about 1 ms, and a retry delay above 2,147,483,647 ms started the next attempt after about 1 ms, because `setTimeout` cannot hold a longer delay. Both now wait the full time. A growing exponential or linear backoff no longer drops to 1 ms once it passes that limit.

  `retry` and `retryOptions` now throw a `Panic` with the code `RETRY_INVALID_DELAY` when `delay` or `maxDelay` is negative, `NaN`, or infinite. These values used to be accepted and behaved like a delay of 0 or 1 ms.

- 30802a0: Read earlier task results in an orchestration `catch` with `ctx.result(task)`

  `ctx.partial` is replaced by `ctx.result(task)`, which returns the result of a task that succeeded before the failure, or `undefined`. A `catch` that returned values from `ctx.partial` made TypeScript infer `any` for a task that returned a value read through `this`, and `flow` resolved as `unknown`. The accessor keeps every task result typed.

- 8677956: Keep `runSync` unavailable when `retry` follows `timeout` or `signal`

  `timeout(100).retry(3).runSync(fn)` used to compile, although `runSync` cannot stop synchronous work at a deadline or a cancellation. It is now a type error, as `timeout(100).runSync(fn)` already was. Use `run` for work that needs a deadline or a signal.

- df4cdb4: Treat a `TimeoutError` or `CancellationError` that `try` rethrows from a nested call as an ordinary failure

  `run` and `runSync` used to return such an error without retrying it or passing it to `catch`, even when the call had no `timeout` or `signal` and its type left the error out. Only the call's own deadline and signal now produce policy failures, as in `all`.

- df4cdb4: Resolve `all`, `allSettled`, and `flow` failures as values, like `run`

  Every terminal call now resolves with a result union and throws only a `Panic`. Before, the orchestration calls rejected, and their types did not show it.

  - A task failure that `catch` does not map resolves as `UnhandledException`, with the failure as `cause`.
  - The call's own `timeout` and `signal` resolve as `TimeoutError` and `CancellationError`, and the result type includes them.
  - The `catch` of `all` receives the raw task failure, as in `run`.
  - `flow(tasks, { catch })` maps a task failure with the same context as `all`.
  - `flow` rejects a task that is not a function at compile time, as `all` does.
  - The `catch` handler Panic codes are now `CATCH_HANDLER_THROW` and `CATCH_HANDLER_REJECT` for every API.

  Check the result with `instanceof` instead of wrapping the call in `try`/`catch`. An orchestration call nested in `run` now returns its failure as a value, so throw it if the outer call should retry or map it.

- df4cdb4: Fix three cases where a mistake passed the type checker and failed at runtime

  - Every context passed to user code is read-only: `try`, `shouldRetry`, task `this`, and the `catch` context of `all` and `flow`. Writing `ctx.retry.attempt` no longer changes how many attempts run.
  - `timeout(a).timeout(b)` keeps the tighter deadline instead of the last one.
  - `$exit` ends the flow when it is called, even if the task catches what it throws or calls it inside a nested `run`.

- 0393d9c: Throw a `Panic` when a task cleanup fails in `all`, `allSettled`, or `flow`

  A cleanup on `this.$disposer` that throws or rejects used to make the call reject with the raw error, although an orchestration call otherwise rejects only with a `Panic`. The call now runs the rest of the cleanup, then throws a `Panic` with the code `TASK_CLEANUP_THROW`. The `cause` is the cleanup error. When this call's own deadline or signal fired, or a task failure stopped the graph, even one that `catch` mapped, the `cause` is a `SuppressedError` that keeps both errors. A `Panic` from a task or from `catch` still wins.

  To keep a cleanup that can fail from throwing, catch its error inside the cleanup.

- eccfd94: Accept time expressions such as `"500ms"` for retry delays and timeouts, and drop the `Ms` suffix from the retry options

  `retry({ backoff: "exponential", delay: "200ms", maxDelay: "2s", limit: 4 })` is the same as `delay: 200, maxDelay: 2000`, and `timeout("5s")` is the same as `timeout(5000)`. The type checker checks a literal expression with `@sanely/duration`, so `"1M"` fails to compile with the reason. A string from config needs `isTimeExpression` from `@sanely/duration` first. A string that is not a time expression throws a `Panic` with the code `RETRY_INVALID_DELAY` from `retry` and `retryOptions`, or `TIMEOUT_INVALID_MS` from `timeout`. `retryOptions` still returns `delay` and `maxDelay` in milliseconds.

  To migrate, rename `delayMs` to `delay` and `maxDelayMs` to `maxDelay` in every retry policy. The old names no longer compile, and `retry` ignores them at run time, so untyped code that keeps them retries without a delay. Code that reads `delayMs` or `maxDelayMs` from the result of `retryOptions` reads `delay` and `maxDelay` instead.

  `@sanely/try` now depends on `@sanely/duration`.

- df4cdb4: Return the work's result whatever a `wrap` returns

  A wrap that forgot to return `next()` made the call resolve with `undefined`. The call now returns the result of the work. A wrap that never calls `next()`, calls it twice, or throws or rejects throws a `Panic` with the code `WRAP_NEXT_NOT_CALLED`, `WRAP_NEXT_CALLED_TWICE`, or `WRAP_THROW`.

### Patch Changes

- 34e9ecc: Report a cleanup callback that throws `undefined`

  `disposer().dispose()` now rejects with `undefined` when a cleanup callback throws `undefined`, as native `AsyncDisposableStack` does. It used to resolve as if every cleanup succeeded, and a later cleanup failure lost the earlier one instead of keeping it as the `suppressed` error of a `SuppressedError`. The same fix applies to `this.$disposer` in `all`, `allSettled`, and `flow`.

- ceb31b0: Keep a `timeout` deadline steady when the system clock changes

  A deadline now counts the time that passes on the monotonic clock. An NTP correction or a manual clock change used to end a `timeout` run early with a `TimeoutError`, or let it run late.

- 8677956: Let `runSync` run every retry policy without a delay

  `runSync` now accepts a retry policy whose `delay` is omitted or `0`, whatever its `backoff` or `jitter`. For example, `retry({ backoff: "linear", limit: 3 }).runSync(fn)` compiles and runs. It used to fail to compile, and at run time it threw a `Panic` with the code `RUN_SYNC_ASYNC_RETRY_POLICY`. A policy with a delay still hides `runSync` and still throws that `Panic` from untyped code.

- 1eb6d53: Infer a union returned by a `run()` `try` or `catch` without explicit type arguments

  A `catch` such as `(error) => (error instanceof TypeError ? new BusyError() : new InternalError())` now gives `BusyError | InternalError` in the result union instead of a type error.

- Updated dependencies [a72bd6a]
- Updated dependencies [a72bd6a]
- Updated dependencies [e6ab5a0]
- Updated dependencies [a72bd6a]
- Updated dependencies [a72bd6a]
  - @sanely/duration@0.1.0
