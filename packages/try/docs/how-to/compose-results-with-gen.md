# How to compose results with `gen`

This guide shows you how to chain several calls that each return a result union, without a check after each call.

1. Write the steps in a generator function. Unwrap each result with `yield* use(...)`:

   ```ts
   import * as try$ from "@sanely/try"

   const summary = await try$.gen(function* (use) {
     const response = yield* use(try$.run(() => fetch("https://api.example.com/orders")))
     const orders = yield* use(try$.run(() => response.json() as Promise<Array<{ total: number }>>))

     const revenue = orders.reduce((sum, order) => sum + order.total, 0)
     return `${orders.length} orders, ${revenue} total`
   })

   // summary is string | UnhandledException
   ```

   When a step returns an `Error` instance, `gen` stops and returns that error.

2. Always `await` the result of a `gen` that has an async step. Do not call `.then()` on it. When a step can return a promise, the result type is `R | Promise<R>`. `gen` stays synchronous until it reaches a promise, so a failure before that step, or a skipped async step, returns a plain value. When every step is synchronous, `gen` returns its result directly.

3. Map failures to `Error` subclasses. `gen` finds failures with `instanceof Error`. A failure value that is not an `Error` instance, such as a plain object from `catch`, or an error from another realm, continues into the generator as a success value.
