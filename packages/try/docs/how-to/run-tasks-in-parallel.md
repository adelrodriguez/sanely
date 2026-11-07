# How to run tasks in parallel

This guide shows you how to run a group of named tasks at the same time, with one deadline and one cancellation signal for the whole group.

## Stop at the first failure with `all`

Use `all` when the result is useless unless every task succeeds. Write each task as a method. A task can await the result of another task through `this.$result`:

```ts
import * as try$ from "@sanely/try"

const page = await try$.all({
  async user() {
    const response = await fetch("https://api.example.com/me", { signal: this.$signal })
    return (await response.json()) as { id: string; name: string }
  },
  async invoices() {
    const user = await this.$result.user

    const response = await fetch(`https://api.example.com/users/${user.id}/invoices`, {
      signal: this.$signal,
    })
    return (await response.json()) as Array<{ total: number }>
  },
})

// page is { user: { id: string; name: string }; invoices: Array<{ total: number }> }
```

When one task fails, `this.$signal` aborts in every other task, and `all` rejects with the error. To return a value instead, pass `catch`:

```ts
class PageUnavailableError extends Error {}

const page = await try$.all(tasks, {
  catch: (error, { failedTask, partial }) => new PageUnavailableError(`${failedTask} failed`),
})
```

`partial` holds the results of the tasks that succeeded before the failure.

## Keep every outcome with `allSettled`

Use `allSettled` when a failure is input to the next decision. Each task result has the format of `Promise.allSettled`:

```ts
const checks = await try$.allSettled({
  async api() {
    const response = await fetch("https://api.example.com/health")
    return response.status
  },
  async cdn() {
    const response = await fetch("https://cdn.example.com/health")
    return response.status
  },
})

if (checks.api.status === "rejected") {
  console.error("api is down:", checks.api.reason)
}
```

A `Panic` is never a settled outcome. If a task panics, `allSettled` aborts the other tasks, waits for them, and throws the `Panic`.

## Set a deadline for the group

Put `timeout` before the call. The deadline covers the whole group:

```ts
const page = await try$.timeout(5_000).all(tasks)
```

When the deadline fires, every `this.$signal` aborts, and the call rejects with `TimeoutError` after every task settles. Orchestration does not support `retry`. To retry one request, see [How to run an ordered workflow with `flow`](./run-a-workflow.md#retry-one-step).

## Cancel the group from outside

Pass a signal to `signal` before the call. Abort it to stop every task:

```ts
const controller = new AbortController()

window.addEventListener("popstate", () => controller.abort())

const data = await try$.signal(controller.signal).all({
  async posts() {
    const response = await fetch("https://api.example.com/posts", { signal: this.$signal })
    return response.json()
  },
  async comments() {
    const response = await fetch("https://api.example.com/comments", { signal: this.$signal })
    return response.json()
  },
})
```

The call rejects with `CancellationError` after every task settles.

## Bound work that takes no signal

Some work cannot take an `AbortSignal`, such as a legacy client. Wrap its promise in `this.$race(...)`, so that the deadline and cancellation still end the task:

```ts
async function buildReport(legacy: { generateReport(): Promise<{ rows: number }> }) {
  return try$.timeout(5_000).all({
    async report() {
      return await this.$race(legacy.generateReport())
    },
  })
}
```

`$race` rejects with the abort reason when the signal fires first. It cannot stop the work, so the abandoned promise keeps running.

Refer to the [orchestration reference](../reference.md#orchestration) for the task context and the result types.
