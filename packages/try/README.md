<div align="center">
  <h1 align="center">🔁 <code>@sanely/try</code></h1>

  <p align="center">
    <strong>A better try/catch for TypeScript</strong>
  </p>

  <p align="center">
    <a href="https://www.npmjs.com/package/@sanely/try"><img src="https://img.shields.io/npm/v/@sanely/try" alt="npm version" /></a>
    <a href="../../LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  </p>
</div>

`@sanely/try` is a small execution layer for TypeScript. You write normal functions. The package runs them, applies your retry, timeout, and cancellation policy, and returns errors as typed values instead of thrown exceptions.

The return type tells you everything that can come back: your value, the failures that you map, and the policy failures that your chain can add.

```ts
import * as try$ from "@sanely/try"

class OrderLookupError extends Error {}

const result = await try$
  .retry(3) // Up to 3 attempts in total, including the first
  .timeout("5s") // One total deadline across all attempts, in milliseconds or a time expression
  .run({
    try: async ({ signal }) => {
      const response = await fetch("https://api.example.com/orders/ord_123", {
        signal, // Aborts when the deadline expires
      })

      if (!response.ok) {
        throw new Error(`unexpected status ${response.status}`)
      }

      const order = (await response.json()) as { status: "pending" | "shipped" }
      return order.status
    },
    catch: () => new OrderLookupError("could not load the order"),
  })

// result is "pending" | "shipped" | OrderLookupError | TimeoutError
```

## Features

- **Errors as values.** Thrown errors come back as part of the return type.
- **Execution policies.** Add retries, one total deadline, and cancellation without a change to the work.
- **Sync and async parity.** `runSync(...)` maps failures and builds result unions the same way as `run(...)`. Policies that wait or interrupt are async only.
- **Named task orchestration.** Run concurrent and ordered workflows as objects of named tasks.
- **Instrumentation hooks.** Observe execution with `wrap(...)` for logs, traces, and metrics.
- **Resource cleanup.** Register teardown that works across async boundaries with `disposer()` and task disposers.
- **One small runtime dependency.** [`@sanely/duration`](../duration) reads time expressions such as `"500ms"`.

## Install

```bash
npm install @sanely/try
```

The package needs `AbortSignal.any` and `Promise.withResolvers`. Node.js 22 or later has both, and the package declares that floor in its `engines` field. Recent Bun, Deno, and current browsers also have both.

## Get started

Run a function. A thrown error comes back as an `UnhandledException` value:

```ts
import * as try$ from "@sanely/try"

const result = await try$.run(async () => {
  const response = await fetch("https://api.example.com/health")
  return response.status
})

// result is number | UnhandledException
```

Use the object form to map thrown errors to your own error types:

```ts
class InvalidConfigError extends Error {}

const config = try$.runSync({
  try: () => JSON.parse(process.env.APP_CONFIG ?? "") as { port: number },
  catch: () => new InvalidConfigError("APP_CONFIG is not valid JSON"),
})

// config is { port: number } | InvalidConfigError
```

## Documentation

How-to guides:

- [How to map thrown errors to domain errors](docs/how-to/map-thrown-errors.md)
- [How to add retries, a deadline, and cancellation](docs/how-to/add-retries-a-deadline-and-cancellation.md)
- [How to log and trace execution with `wrap`](docs/how-to/instrument-execution.md)
- [How to run tasks in parallel](docs/how-to/run-tasks-in-parallel.md)
- [How to run an ordered workflow with `flow`](docs/how-to/run-a-workflow.md)
- [How to compose results with `gen`](docs/how-to/compose-results-with-gen.md)
- [How to clean up resources with `disposer`](docs/how-to/clean-up-resources.md)

Reference:

- [`@sanely/try` reference](docs/reference.md)

Explanation:

- [About errors as values in `@sanely/try`](docs/explanation/about-errors-as-values.md)

To work on the package, read [CONTRIBUTING.md](CONTRIBUTING.md).

## Acknowledgments

- [`better-result`](https://github.com/dmmulroy/better-result) for typed result-oriented error handling in TypeScript.
- [`effect`](https://github.com/Effect-TS/effect) for structured, composable models of execution, failure, and concurrency.
- [`better-all`](https://github.com/shuding/better-all) for task orchestration patterns over object-shaped work graphs.
- [`errore`](https://errore.org/) for modeling errors as unions instead of tuples.

Made with [🥐 `pastry`](https://github.com/adelrodriguez/pastry).

## License

MIT. See [LICENSE](../../LICENSE).
