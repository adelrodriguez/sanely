# How to observe evaluations with hooks

This guide shows you how to send telemetry, track exposures, or log failures for each evaluation, without a change to its result.

1. Write a hook with the phases that you need:

   ```typescript
   import type { Hook } from "@sanely/flags"

   const telemetry: Hook<UserIdentity> = {
     before: (context) => {
       metrics.start(context.flag.key)
     },
     after: (context, decision, { source }) => {
       metrics.success(context.flag.key, source)
     },
     error: (context, error) => {
       metrics.failure(context.flag.key, error._tag)
     },
     finally: (context) => {
       metrics.finish(context.flag.key)
     },
   }
   ```

   - `before` runs after the identity resolves, and before the store and the provider work.
   - `after` runs after a valid decision from the store or the provider.
   - `error` runs when the evaluation falls back to the default.
   - `finally` runs after the success path or the error path.

2. Register the hook on the reader, and report hook failures with `onError`:

   ```typescript
   const flags = createFlags({
     provider,
     identify,
     hooks: [telemetry],
     onError: (report) => {
       if (report._tag === "HookFailed") logger.warn(report.phase, report.hookIndex, report.error)
     },
   })
   ```

A hook that throws does not stop the evaluation or change its result. `onError` receives a `HookFailed` report, and the other hooks in the phase still run.

## Do not depend on `after` and `finally` finishing

The read does not wait for the `after` and `finally` phases. Do not use them for work that must finish before a serverless runtime exits.

## Track exposures

Use an `after` hook for exposure tracking. It runs once for each evaluation, also when evaluations share one provider call.

## Keep state in a hook

The reader shares one hook object between every evaluation. If a hook keeps state, create a new hook object for each reader:

```typescript
function countingHook(label: string): Hook {
  let count = 0
  return {
    after: () => {
      count += 1
      metrics.gauge(label, count)
    },
  }
}

const flags = createFlags({ provider, identify, hooks: [countingHook("flags")] })
```

Refer to the [`Hook` reference](../reference.md#hooks) for the context fields.
