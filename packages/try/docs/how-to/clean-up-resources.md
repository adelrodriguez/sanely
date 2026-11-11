# How to clean up resources with `disposer`

This guide shows you how to register cleanup next to the code that creates a resource, so that the cleanup runs when the work ends, even after an error.

## Clean up in a scope

1. Create a disposer with `await using`:

   ```ts
   import * as try$ from "@sanely/try"

   await using disposer = try$.disposer()
   ```

2. Register each cleanup right after you create the resource:

   ```ts
   const worker = new Worker("./video-encoder.js")
   disposer.defer(() => worker.terminate())

   const heartbeat = setInterval(() => worker.postMessage("ping"), 1_000)
   disposer.defer(() => clearInterval(heartbeat))
   ```

   To track an object that has `Symbol.dispose` or `Symbol.asyncDispose`, call `disposer.use(resource)`.

3. Let the scope end. The disposer runs the cleanup in reverse order: here, the heartbeat stops first, and then the worker ends.

If your runtime does not support `await using`, call `await disposer.dispose()` in a `finally` block.

## Clean up in a task

In `all`, `allSettled`, and `flow`, each task has `this.$disposer`. Its cleanup runs when the orchestration settles:

```ts
await try$.all({
  async upload() {
    const file = await open("report.csv")
    this.$disposer.defer(() => file.close())

    return await send(file)
  },
})
```

A cleanup must not throw. If it throws or rejects, the orchestration throws a `Panic` with the code `TASK_CLEANUP_THROW` after the rest of the cleanup runs. For a cleanup that can fail, such as closing a connection that may already be closed, catch the error inside the cleanup.

The package does not need the native `DisposableStack` and `AsyncDisposableStack` globals.
