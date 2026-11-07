# How to cache provider decisions

This guide shows you how to store provider decisions in a cache, drop them when the provider reports a change, and control which evaluations share a decision.

## Add a cache store

1. Write a store with `get`, `set`, and an optional `delete`. The store controls serialization and expiry:

   ```typescript
   import type { Decision } from "@sanely/flags"

   const cache = {
     get: (key: string) => redis.get<Decision>(key),
     set: (key: string, value: Decision) => redis.set(key, value),
     delete: (key: string) => redis.del(key),
   }
   ```

   A variant payload can hold values that are not JSON-safe. A persistent store must keep them, or the provider must return JSON-safe payloads.

2. Pass the store to the factory, and report cache errors with `onCacheError`:

   ```typescript
   const flag = createFlags({
     cache,
     identify,
     decide,
     onCacheError: (report) => reportCacheError(report),
   })
   ```

A cache error does not fail the evaluation. The package discards an invalid cached decision and asks the provider.

## Drop decisions when the provider changes a flag

If the provider can push flag changes, add `subscribe`. The package calls it with a `notify` function, and expects a function that detaches:

```typescript
const flag = createFlags({
  cache,
  identify,
  decide,
  subscribe: (notify) => provider.on("change", (keys) => notify({ keys })),
})
```

Call `notify({ keys })` to invalidate the named flags, or `notify({})` to invalidate every flag. The package drops the cached decisions and the running provider calls for those flags. If `subscribe` throws, `onCacheError` reports the error, and the evaluation does not fail. React flag reads and prefetches also continue, and they try to attach again on the next new cache entry.

To run your own code on a change, listen on `flag.changes`:

```typescript
const stop = flag.changes.subscribe((keys) => console.log("changed", keys ?? "all"))
```

## Turn off request coalescing

By default, concurrent evaluations with the same evaluation key share one provider call. If `decide` has a side effect that must run for each evaluation, such as exposure logging in the provider, turn coalescing off:

```typescript
const flag = createFlags({
  coalesce: false,
  identify,
  decide,
})
```

To keep coalescing and still track each exposure, use an `after` hook. See [How to observe evaluations with hooks](./observe-evaluations-with-hooks.md#track-exposures).

## Include more identity fields in the key

The default evaluation key holds the flag key, the flag shape, and the type and value of `distinctId`. If other identity fields change the decision, give an `evaluationKey` function:

```typescript
const flag = createFlags({
  cache,
  identify,
  decide,
  evaluationKey: (context) =>
    JSON.stringify([context.flagKey, context.identity?.distinctId, context.identity?.plan]),
})
```

The function replaces the whole default key. Return the same key only for evaluations that can share one provider decision.

[Why evaluations share decisions](../explanation/about-flag-evaluation.md#concurrent-evaluations-share-provider-work) explains the cache and coalescing model.
