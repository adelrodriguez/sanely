# `@sanely/try` reference

The package has three entry points:

| Entry point          | Exports                                                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `@sanely/try`        | `run`, `runSync`, `retry`, `retryOptions`, `timeout`, `signal`, `wrap`, `all`, `allSettled`, `flow`, `gen`, `disposer`                 |
| `@sanely/try/errors` | `CancellationError`, `TimeoutError`, `RetryExhaustedError`, `UnhandledException`, `Panic`, their type guards, and the type `PanicCode` |
| `@sanely/try/types`  | The types `AllSettledResult`, `SettledResult`, `SettledFulfilled`, `SettledRejected`, `AsyncDisposer`, and `FlowExit`                  |

```ts
import type { SettledResult } from "@sanely/try/types"
import * as try$ from "@sanely/try"
import { isTimeoutError } from "@sanely/try/errors"
```

## Terminal execution

### `run(fn)` and `run({ try, catch })`

```ts
run<T>(fn: (ctx) => T | Promise<T>): Promise<T | UnhandledException | PolicyErrors>
run<T, C>(options: { try: (ctx) => T | Promise<T>; catch: (error: unknown) => C | Promise<C> }): Promise<T | C | PolicyErrors>
```

Runs the work and resolves with a result union. It never rejects with an error from the work.

- Without `catch`, a thrown error becomes an `UnhandledException`, or a `RetryExhaustedError` after a retry policy. The original error is the `cause`.
- With `catch`, `catch` receives the thrown error, or the error of the last attempt after a retry policy. Its return value is part of the result.
- `catch` never receives the `TimeoutError` of this call's own deadline, the `CancellationError` of its own signal, or a `Panic`. A `TimeoutError` or `CancellationError` that `try` rethrows from a nested call is retried and goes to `catch` like any other failure.
- A `catch` that throws or rejects throws a `Panic`.

The context is read-only. `try` and `shouldRetry` receive the same context, with these fields:

| Field           | Type          | Present                     | Description                                                    |
| --------------- | ------------- | --------------------------- | -------------------------------------------------------------- |
| `signal`        | `AbortSignal` | After `timeout` or `signal` | Aborts when the deadline expires or an external signal aborts. |
| `retry.attempt` | `number`      | After `retry`               | The current attempt, from 1.                                   |
| `retry.limit`   | `number`      | After `retry`               | The attempt limit.                                             |

```ts
const status = await try$.run(async () => (await fetch(url)).status)
// status is number | UnhandledException
```

### `runSync(fn)` and `runSync({ try, catch })`

The synchronous form of `run`. It has the same result rules. It throws a `Panic` when `try` or `catch` returns a promise, or when a wrap returns a promise.

```ts
const url = try$.runSync(() => new URL(link))
// url is URL | UnhandledException
```

### Result union rules

In the signatures on this page, `PolicyErrors` stands for the policy failures that the chain adds: `TimeoutError` after `timeout`, and `CancellationError` after `signal`.

| Chain                            | Result type                       |
| -------------------------------- | --------------------------------- |
| `run(fn)`                        | `T \| UnhandledException`         |
| `run({ try, catch })`            | `T \| C`                          |
| `retry(...).run(fn)`             | `T \| RetryExhaustedError`        |
| `retry(...).run({ try, catch })` | `T \| C`                          |
| `all(tasks)`                     | `Results \| UnhandledException`   |
| `all(tasks, { catch })`          | `Results \| C`                    |
| `allSettled(tasks)`              | `SettledResults`                  |
| `flow(tasks)`                    | `ExitValue \| UnhandledException` |
| `flow(tasks, { catch })`         | `ExitValue \| C`                  |
| `timeout(...)` in the chain      | Adds `TimeoutError`.              |
| `signal(...)` in the chain       | Adds `CancellationError`.         |

## Policy builders

A policy builder runs no work. It configures the next terminal call or orchestration call, and returns a builder.

| Builder               | `run` | `runSync` | `wrap` | `all`, `allSettled`, `flow` |
| --------------------- | ----- | --------- | ------ | --------------------------- |
| `retry(limit)`        | Yes   | Yes       | No     | No                          |
| `retry(policy)`       | Yes   | No delay  | No     | No                          |
| `timeout(ms)`         | Yes   | No        | No     | Yes, unless after `retry`   |
| `signal(abortSignal)` | Yes   | No        | No     | Yes, unless after `retry`   |
| `wrap(fn)`            | Yes   | Yes       | Yes    | Yes                         |

The table shows which methods stay available after each builder. The limits are type-level. `runSync` stays available after `retry(policy)` only when the policy has no delay, which means that `delayMs` is omitted or a literal `0`. Once `timeout` or `signal` is in the chain, a later `retry` does not bring `runSync` back.

At run time, orchestration after `retry` throws a `Panic` with the code `ORCHESTRATION_UNSUPPORTED_POLICY`, and `runSync` with a retry policy whose `delayMs` is not `0` throws a `Panic` with the code `RUN_SYNC_ASYNC_RETRY_POLICY` before the work starts.

### `retry(limit)`

```ts
retry(limit: number)
```

Retries with no delay, up to `limit` attempts in total. `limit` counts the first attempt, and must be a positive integer. A literal `0`, a negative literal, or a fraction is a type error. Another invalid value throws a `Panic` with the code `RETRY_INVALID_LIMIT`.

### `retry(policy)`

```ts
retry(policy: RetryPolicy)
```

| Option        | Type                                      | Default  | Description                                       |
| ------------- | ----------------------------------------- | -------- | ------------------------------------------------- |
| `limit`       | `number`                                  | Required | The most attempts, including the first.           |
| `backoff`     | `"constant" \| "linear" \| "exponential"` | Required | How the delay grows.                              |
| `delayMs`     | `number`                                  | `0`      | The base delay between attempts, in milliseconds. |
| `maxDelayMs`  | `number`                                  | None     | The longest delay. Only for `"exponential"`.      |
| `jitter`      | `boolean`                                 | `false`  | Use a random delay from 0 to the computed delay.  |
| `shouldRetry` | `(error: unknown, ctx) => boolean`        | None     | Return `false` to stop after this error.          |

The delay after attempt `n` is:

| `backoff`       | Delay                                          |
| --------------- | ---------------------------------------------- |
| `"constant"`    | `delayMs`                                      |
| `"linear"`      | `delayMs * n`                                  |
| `"exponential"` | `delayMs * 2 ** (n - 1)`, at most `maxDelayMs` |

`delayMs` and `maxDelayMs` must be finite numbers that are not negative, or `retry` throws a `Panic` with the code `RETRY_INVALID_DELAY`. Without `maxDelayMs`, a computed delay is at most `Number.MAX_SAFE_INTEGER` milliseconds. A delay above the 32-bit timer limit of about 24.8 days waits the full time.

```ts
try$.retry({ backoff: "exponential", delayMs: 100, maxDelayMs: 5_000, jitter: true, limit: 5 })
```

### `retryOptions(options)`

```ts
function retryOptions(options: number | RetryPolicy): RetryPolicy
```

Returns the policy that `retry` uses for `options`. It throws a `Panic` with the code `RETRY_INVALID_LIMIT` for an invalid limit, and with the code `RETRY_INVALID_DELAY` for an invalid `delayMs` or `maxDelayMs`.

```ts
try$.retryOptions(3) // { backoff: "constant", delayMs: 0, limit: 3 }
```

### `timeout(ms)`

```ts
timeout(ms: number)
```

Sets one total deadline. For `run`, it covers every attempt, the delays, and `catch`. For orchestration, it covers the whole task graph. `ms` must be a finite number that is not negative, or `timeout` throws a `Panic` with the code `TIMEOUT_INVALID_MS`. When the chain already has a deadline, the tighter deadline applies. The deadline counts the time that passes on the monotonic clock, so a change to the system clock does not move it, and a deadline above the 32-bit timer limit of about 24.8 days waits the full time.

### `signal(abortSignal)`

```ts
signal(abortSignal: AbortSignal)
```

Adds external cancellation. You can call it more than once. Any of the signals cancels the work.

### `wrap(fn)`

```ts
wrap(fn: (ctx: WrapCtx, next: () => unknown) => unknown)
```

Adds a hook around the whole terminal call, retries included. `fn` must call `next()` exactly once. `next()` returns the result of the work, and the call returns that result whatever `fn` returns. When `fn` returns a promise, the call waits for it before it resolves. A wrap that never calls `next()`, calls it twice, or throws or rejects throws a `Panic`. `ctx` is a read-only view of the context, and `ctx.retry.attempt` is live. The first wrap that you add is the outermost.

## Orchestration

### Tasks

`all`, `allSettled`, and `flow` take an object of tasks. Each task is a method. Inside a task, `this` is read-only and has these members:

| Member           | Type                     | Description                                                                                             |
| ---------------- | ------------------------ | ------------------------------------------------------------------------------------------------------- |
| `this.$result`   | `{ [task]: Promise<T> }` | The results of the other tasks. A task that reads its own result, or an unknown task, throws a `Panic`. |
| `this.$signal`   | `AbortSignal`            | Aborts when the orchestration stops, from a failure, an exit, the deadline, or cancellation.            |
| `this.$disposer` | `AsyncDisposer`          | Cleanup that runs when the orchestration settles. A cleanup that throws or rejects throws a `Panic`.    |
| `this.$race(p)`  | `Promise<V>`             | Resolves with `p`, or rejects with the abort reason when `this.$signal` aborts first.                   |
| `this.$exit(v)`  | `FlowExit<V>`            | Only in `flow`. Ends the flow with `v`.                                                                 |

All tasks start together. Every orchestration call waits for every running task to settle before it resolves.

Like `run`, an orchestration call resolves with a result union and never rejects with an error from the work. A task failure that `catch` does not map becomes an `UnhandledException`, with the original error as the `cause`. The `TimeoutError` of this call's own deadline and the `CancellationError` of its own signal are part of the result. When the deadline and cancellation both fire, the call resolves with `CancellationError`. A `Panic` throws, and wins over every other outcome.

The cleanup on `this.$disposer` runs after every task settles. When a cleanup throws or rejects, the other cleanup still runs, and then the call throws a `Panic` with the code `TASK_CLEANUP_THROW`. Its `cause` is the cleanup error. When this call's own deadline or signal fired, or a task failure stopped the graph, the `cause` is a `SuppressedError` instead, with the cleanup error as `error` and that failure as `suppressed`. The `TimeoutError` or `CancellationError` comes before the task failure, and a task failure that `catch` mapped still counts. A `Panic` from a task or from `catch` wins over this `Panic`.

### `all(tasks, options?)`

```ts
all<T>(tasks: T): Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]>> } | UnhandledException | PolicyErrors>
all<T, C>(tasks: T, options: { catch: (error: unknown, ctx) => C | Promise<C> }): Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]>> } | C | PolicyErrors>
```

Resolves with an object of the task results. When a task fails, every other `this.$signal` aborts. Without `catch`, the call resolves with an `UnhandledException` whose `cause` is the error. With `catch`, `catch` receives the error, and the call resolves with the value of `catch`.

| `catch` context field | Description                                                                                                                                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `failedTask`          | The name of the task that failed, or `undefined`.                                                                                                                                                                |
| `result(task)`        | The result of `task` if it succeeded before the failure, or `undefined`. A task that returns a value read through `this` needs a return type annotation when `catch` reads it, or TypeScript infers it as `any`. |
| `signal`              | The signal of the orchestration.                                                                                                                                                                                 |

`catch` never receives the `TimeoutError` of this call's own deadline, the `CancellationError` of its own signal, or a `Panic`. The call resolves with its own policy failures and throws a `Panic`. A task that fails with a `TimeoutError` or a `CancellationError` from a nested policy, such as `timeout(0).all(...)` inside the task, goes to `catch` like any other failure. A `catch` that throws or rejects throws a `Panic`.

### `allSettled(tasks)`

```ts
allSettled<T>(tasks: T): Promise<AllSettledResult<T> | PolicyErrors>
```

Resolves with an object of settled outcomes, in the format of `Promise.allSettled`: `{ status: "fulfilled", value }` or `{ status: "rejected", reason }`. When this call's own deadline or signal fires, it resolves with the `TimeoutError` or `CancellationError` instead. A `Panic` is never an outcome. The call throws it after every task settles.

### `flow(tasks, options?)`

```ts
flow<T>(tasks: T): Promise<FlowResult<T> | UnhandledException | PolicyErrors>
flow<T, C>(tasks: T, options: { catch: (error: unknown, ctx) => C | Promise<C> }): Promise<FlowResult<T> | C | PolicyErrors>
```

Resolves with the value of the first `this.$exit(value)`. The exit counts when `$exit` is called, even if the task catches what `$exit` throws or calls it inside a nested `run`. The first exit aborts the other `this.$signal` values. `$exit` does not stop a task that already started. When a task fails before the first exit, every other `this.$signal` aborts. Without `catch`, the call resolves with an `UnhandledException` whose `cause` is the error. With `catch`, `catch` receives the error and the same context as the `catch` of `all`, and the call resolves with the value of `catch`. `catch` follows the same rules as in `all`. If no task exits, `flow` throws a `Panic` with the code `FLOW_NO_EXIT`. A `Panic` from any task wins, even after the first exit.

## Composition and cleanup

### `gen(factory)`

```ts
gen(factory: (use) => Generator): Result
```

Runs a generator. `yield* use(value)` returns the value of a success, and ends the generator with the failure when the value is an `Error` instance. `use` also accepts a promise. A value that is not an `Error` instance is a success.

When every step is synchronous, `gen` returns its result directly. When a step can return a promise, the result type is `R | Promise<R>`. `gen` stays synchronous until it reaches a promise, so a failure before that step, or a skipped async step, returns a plain value. Always `await` that result, and do not call `.then()` on it.

```ts
const total = await try$.gen(function* (use) {
  const orders = yield* use(try$.run(loadOrders))
  return orders.length
})
```

### `disposer()`

```ts
function disposer(): AsyncDisposer
```

Returns an `AsyncDisposer`:

| Member                    | Description                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `defer(fn)`               | Registers a cleanup function. It can return a promise.                                                              |
| `use(resource)`           | Registers an object with `Symbol.dispose` or `Symbol.asyncDispose`, and returns it. Accepts `null` and `undefined`. |
| `dispose()`               | Runs the cleanup in reverse order of registration.                                                                  |
| `[Symbol.asyncDispose]()` | Calls `dispose()`. `await using` calls it at the end of the scope.                                                  |

## Errors

The errors come from `@sanely/try/errors`.

| Error                 | `name`                  | When                                                                                                                        |
| --------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `UnhandledException`  | `"UnhandledException"`  | The work or a task threw, and the call has no `catch` and no retry policy. Returned. The error is the `cause`.              |
| `RetryExhaustedError` | `"RetryExhaustedError"` | A retry policy gave up, and the call has no `catch`. Returned. The last error is the `cause`.                               |
| `TimeoutError`        | `"TimeoutError"`        | The call's own deadline expired. Returned.                                                                                  |
| `CancellationError`   | `"CancellationError"`   | The call's own signal aborted. Returned. The `cause` is the abort reason, or the error that the work threw after the abort. |
| `Panic`               | `"Panic"`               | The API was used incorrectly. Always thrown. It has a `code` of type `PanicCode`.                                           |

Each error has a type guard: `isUnhandledException`, `isRetryExhaustedError`, `isTimeoutError`, `isCancellationError`, and `isPanic`. A guard matches an instance of the class, or an `Error` with the same `name`, so it also works across realms and across two copies of the package.

### `PanicCode`

| Code                               | Cause                                                        |
| ---------------------------------- | ------------------------------------------------------------ |
| `CATCH_HANDLER_REJECT`             | A `catch` rejected. The error is the `cause`.                |
| `CATCH_HANDLER_THROW`              | A `catch` threw. The error is the `cause`.                   |
| `FLOW_NO_EXIT`                     | No task of a `flow` called `$exit`.                          |
| `ORCHESTRATION_UNSUPPORTED_POLICY` | An orchestration call came after `retry`.                    |
| `RETRY_INVALID_DELAY`              | A retry `delayMs` or `maxDelayMs` is negative or not finite. |
| `RETRY_INVALID_LIMIT`              | The retry limit is not a positive integer.                   |
| `RUN_SYNC_ASYNC_RETRY_POLICY`      | `runSync` received a retry policy with a delay.              |
| `RUN_SYNC_CATCH_PROMISE`           | The `catch` of `runSync` returned a promise.                 |
| `RUN_SYNC_TRY_PROMISE`             | The `try` of `runSync` returned a promise.                   |
| `RUN_SYNC_WRAPPED_RESULT_PROMISE`  | A wrap of `runSync` returned a promise.                      |
| `TASK_CLEANUP_THROW`               | A cleanup on `this.$disposer` threw or rejected.             |
| `TASK_INVALID_HANDLER`             | A task is not a function.                                    |
| `TASK_SELF_REFERENCE`              | A task read its own result.                                  |
| `TASK_UNKNOWN_REFERENCE`           | A task read the result of an unknown task.                   |
| `TIMEOUT_INVALID_MS`               | The timeout is negative or not finite.                       |
| `UNREACHABLE_RETRY_POLICY_BACKOFF` | The retry policy has an unknown `backoff`.                   |
| `UNREACHABLE_WORK_STATE`           | The wrapped work reached an unknown state.                   |
| `WRAP_NEXT_CALLED_TWICE`           | A wrap called `next()` more than once.                       |
| `WRAP_NEXT_NOT_CALLED`             | A wrap returned without calling `next()`.                    |
| `WRAP_THROW`                       | A wrap threw or rejected. The error is the `cause`.          |

## Types

The types come from `@sanely/try/types`.

| Type                  | Describes                                  |
| --------------------- | ------------------------------------------ |
| `AllSettledResult<T>` | The value that `allSettled` resolves with. |
| `SettledResult<T>`    | `SettledFulfilled<T> \| SettledRejected`.  |
| `SettledFulfilled<T>` | `{ status: "fulfilled"; value: T }`.       |
| `SettledRejected`     | `{ status: "rejected"; reason: unknown }`. |
| `AsyncDisposer`       | The value that `disposer()` returns.       |
| `FlowExit<T>`         | The value that `$exit` returns.            |
