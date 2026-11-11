# How to set timeouts and cancel evaluations

This guide shows you how to limit how long an evaluation can take, and how to cancel one read.

## Set a timeout

Set `timeout` on the reader for every flag, or on one flag to replace it. A timeout is a number of milliseconds or a time expression from [`@sanely/duration`](../../../duration/README.md), such as `"500ms"`:

```typescript
const flags = createFlags({ provider, identify, timeout: "500ms" })

export const checkout = flag.boolean("checkout", false, { timeout: 100 })
```

The type checker checks a literal expression, so `"1M"` fails to compile with the reason. A string from config needs `isTimeExpression` from `@sanely/duration` first. A string that is not a time expression throws `FlagDefinitionError`.

When the deadline passes before the decision is valid, the read returns the default, and `details` reports an `EvaluationTimeoutError`.

The timeout covers identity resolution, the `before` hooks, store reads, provider work, and decision validation. The `after` and `finally` hooks run later and add no latency.

## Cancel one read

Pass an `AbortSignal` in the read options:

```typescript
const controller = new AbortController()

const pending = flags.details(checkout, { signal: controller.signal })
controller.abort()

const details = await pending // details.source is "default"
```

A cancelled read returns the default with an `EvaluationAbortedError`. Its `cause` holds the signal's reason.

## Stop the provider request

A timeout or a cancellation does not stop the provider work by itself. `decide`, `decideOne`, and hooks receive a signal. Pass it to `fetch` or to your provider client:

```typescript
const provider = defineProvider({
  name: "http",
  decideOne: async (flag, identity: UserIdentity, { signal }) => {
    const response = await fetch(`/api/features/${flag.key}`, { signal })
    return decision.boolean((await response.json()).enabled)
  },
})
```

When evaluations share one provider call, its signal aborts only after every evaluation that waits for it has timed out or been cancelled.
