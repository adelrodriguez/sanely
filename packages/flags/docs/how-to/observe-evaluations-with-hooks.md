# How to observe evaluations with hooks

This guide shows you how to send telemetry, track exposures, or log failures for each evaluation, without a change to its result.

1. Define a hook with the phases that you need:

   ```typescript
   import { defineHook } from "@sanely/flags"

   const telemetryHook = defineHook({
     before: (context) => {
       telemetry.start(context.flagKey)
     },
     after: (context, providerDecision, metadata) => {
       telemetry.success(context.flagKey, metadata.source)
     },
     error: (context, error) => {
       telemetry.failure(context.flagKey, error)
     },
     finally: (context) => {
       telemetry.finish(context.flagKey)
     },
   })
   ```

   - `before` runs before the cache and the provider work.
   - `after` runs after a valid cache or provider decision commits.
   - `error` runs when evaluation fails and returns the default.
   - `finally` runs after the success path or the error path.

2. Register the hook on the factory, and report hook failures with `onHookError`:

   ```typescript
   const flag = createFlags({
     identify,
     decide,
     hooks: [telemetryHook],
     onHookError: ({ phase, hookIndex, error }) => {
       reportHookError({ phase, hookIndex, error })
     },
   })
   ```

A hook that throws does not stop the evaluation or change its result. `onHookError` reports hook failures, and the `error` phase reports evaluation failures.

## Do not depend on `after` and `finally` finishing

The evaluator does not wait for the `after` and `finally` phases. Do not use them for work that must finish before a serverless runtime exits.

## Track exposures

Use an `after` hook for exposure tracking. It runs once for each evaluation, also when evaluations share one provider call.

## Keep state in a hook

A hook object is shared by every factory that registers it. If the hook keeps state, pass a function to `defineHook`. Each call of that function makes a new hook:

```typescript
const countingHook = defineHook((options: { label: string }) => {
  let count = 0
  return {
    after: () => {
      count += 1
      metrics.gauge(options.label, count)
    },
  }
})

const flag = createFlags({ identify, decide, hooks: [countingHook({ label: "flags" })] })
```

Refer to the [`Hook` reference](../reference.md#hooks) for the context fields.
