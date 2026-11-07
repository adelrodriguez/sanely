# How to set timeouts and cancel evaluations

This guide shows you how to limit how long an evaluation can take, and how to cancel one evaluation.

## Set a timeout

Set `timeoutMs` on the factory for every gate, or on one gate to override it:

```typescript
const gate = buildGate({
  identify,
  decide: (key, identity, { signal } = {}) => provider.evaluate(key, identity, { signal }),
  timeoutMs: 500,
})

const checkout = gate({
  key: "checkout",
  defaultValue: false,
  timeoutMs: 100,
})
```

When the timeout expires before a decision commits, the evaluation returns the default, and `details()` reports a `GateTimeoutError`.

The timeout covers identity resolution, the `before` hooks, cache reads, provider work, and decision validation. The `after` and `finally` hooks run after the commit and add no latency.

## Cancel one evaluation

Pass an `AbortSignal` in the call:

```typescript
const controller = new AbortController()

const pendingResult = checkout.details({ signal: controller.signal })
controller.abort()

const result = await pendingResult // result.source is "default"
```

If no decision has committed, a cancellation returns the default.

## Stop the provider request

The timeout and the cancellation do not stop the provider work by themselves. Hooks, `decide`, and `decideMany` receive the signal. Pass it to `fetch` or to your provider client, as the `decide` above does.
