# About errors as values in `@sanely/try`

This page explains why `@sanely/try` returns errors as values, how its three layers fit together, and why the builder chain has the rules that it has.

## Why not plain try/catch

Plain `try/catch` works well for small, isolated code. It scales poorly when one block must retry, track a deadline, handle cancellation, and map errors at the same time. Here is one operation with all of that policy written by hand:

```ts
class UserUnavailableError extends Error {}

async function loadUser(signal: AbortSignal) {
  let lastError: unknown

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const timeout = AbortSignal.timeout(1_500)
    const combined = AbortSignal.any([signal, timeout])

    try {
      const response = await fetch("https://api.example.com/users/42", { signal: combined })

      if (!response.ok) {
        throw new Error(`unexpected status ${response.status}`)
      }

      return (await response.json()) as { id: number; name: string }
    } catch (error) {
      lastError = error

      if (combined.aborted || attempt === 3) {
        break
      }
    }
  }

  return new UserUnavailableError("user service unavailable", { cause: lastError })
}
```

The policy and the work are mixed together, and the return type does not show the failures. With `@sanely/try`, you declare the policy outside the work, and the failures become part of the return type:

```ts
import * as try$ from "@sanely/try"

const result = await try$
  .retry(3)
  .timeout(1_500)
  .signal(controller.signal)
  .run({
    try: async ({ signal }) => {
      const response = await fetch("https://api.example.com/users/42", { signal })

      if (!response.ok) {
        throw new Error(`unexpected status ${response.status}`)
      }

      return (await response.json()) as { id: number; name: string }
    },
    catch: () => new UserUnavailableError("user service unavailable"),
  })

// result is { id: number; name: string } | UserUnavailableError | TimeoutError | CancellationError
```

A caller can read the failure behavior of a function from its return type, without reading its body. One difference remains: this deadline covers all three attempts, and the hand-written version gives each attempt its own 1.5 seconds.

## Three layers

The package has three layers:

1. Terminal execution runs the work and produces the result union. `run` and `runSync` run one function.
2. Policy builders configure the next terminal call. `retry`, `timeout`, and `signal` do not run work. `timeout` and `signal` add their policy failures to the result union. `retry` changes the failure only when you give no `catch`: a failure after the last attempt is a `RetryExhaustedError`, not an `UnhandledException`.
3. Orchestration is terminal execution for a group of named tasks, with the same result rules as `run`. `all` stops at the first failure, `allSettled` keeps every outcome, and `flow` runs until a task calls `$exit`.

The package has three more tools outside the layers. `wrap` observes execution without a change to it. `gen` composes result unions in a linear style. `disposer` registers cleanup that runs when the work ends.

## Three kinds of failure

The package treats three kinds of failure in different ways:

- A domain failure is a value that you map with `catch`, such as a `ValidationError`. It is an expected outcome of your domain.
- A policy failure comes from the chain: `TimeoutError`, `CancellationError`, or `RetryExhaustedError`. It is in the result union when you add the matching policy.
- A panic signals programmer misuse, such as an invalid builder chain or an invalid task graph. The package throws a `Panic`, and a panic is never part of a result union.

The `catch` contract keeps these apart. `catch` maps only the errors that started inside `try`: an error that the work threw, or the error of the last attempt after the retry policy gives up. A policy failure from the call's own chain never goes through `catch`. If it did, a `catch` written for a parse error could turn a timeout into a parse error, and the caller would lose the difference. A `TimeoutError` that `try` rethrows from a nested call is different: for this call, it is an error that the work threw, so `catch` receives it.

## Why the chain has a fixed order

`wrap` must come first. A wrap observes the whole terminal call, retries included, so its place in the chain does not change what it sees, and the types allow it only at the start of the chain.

`retry` removes the orchestration methods. A retry of a whole task graph would run every task again, including the tasks that succeeded. Apply `retry` to a `run` inside the task that needs it.

`runSync` stays available after a retry policy that never waits. Every backoff multiplies `delay`, so a policy without a delay never waits, whatever its backoff or jitter. `runSync` is not available after a policy with a delay, or in a chain with `timeout` or `signal`, because those policies can wait or interrupt, and synchronous code cannot. The types are conservative: they block a policy whose `delay` has the type `number`, even when its value is `0`, because the value is unknown until run time.

## Cancellation is cooperative

An aborted signal does not stop JavaScript code by itself. A deadline or a cancellation aborts `signal` in `run`, or `this.$signal` in a task. The work must pass that signal to `fetch` or another signal-aware API, check it between steps, or use `this.$race`.

Orchestration waits for every running task to settle before it resolves with a `TimeoutError` or a `CancellationError`. Because of this, no task code still runs after the call returns, and a caller can retry safely after a `TimeoutError`. The cost is that a task that ignores its signal delays the result. `run` does not wait: it owns no task cleanup, so it returns at the deadline and leaves the abandoned work running.

## Why `gen` checks `instanceof Error`

`gen` must decide, for each step, whether the value is a success or a failure. The result unions of the package hold errors as `Error` instances, so `gen` uses `instanceof Error`. A failure value that is not an `Error` instance, such as a plain object from `catch`, or an error from another realm, passes as a success. For this reason, map failures to `Error` subclasses when you use `gen`.

## When not to use the package

When you can use [`Effect`](https://github.com/Effect-TS/effect) in your codebase, use Effect. It is a much more complete model of execution, failure, and concurrency. `@sanely/try` is for code that stays with plain functions and promises.
