# How to cache provider decisions

This guide shows you how to store provider decisions, drop them when the provider reports a change, and control which evaluations share a decision.

## Add a store

1. Write a store with `get`, `set`, and an optional `delete`. The store controls serialization and expiry:

   ```typescript
   import type { DecisionStore, Decision } from "@sanely/flags"

   const store: DecisionStore = {
     get: (key) => redis.get<Decision>(key),
     set: async (key, decision) => {
       await redis.set(key, decision, { ex: 60 })
     },
     delete: (key) => redis.del(key),
   }
   ```

   A variant payload can hold values that are not JSON-safe. A persistent store must keep them, or the provider must return JSON-safe payloads. The store keeps the raw payload, and the flag's parser runs after each read.

2. Pass the store in the `cache` option, and report store failures with `onError`:

   ```typescript
   const flags = createFlags({
     provider,
     identify,
     cache: { store },
     onError: (report) => {
       if (report._tag === "StoreFailed") logger.warn(report.operation, report.key, report.error)
     },
   })
   ```

A store failure does not fail the evaluation. The package discards an invalid stored decision and asks the provider.

## Drop decisions when the provider changes a flag

Give the provider a [`subscribe` function](./write-a-provider.md#report-flag-changes). With a store that has `delete`, a change notification deletes the stored decisions of the changed flags, and drops the running provider calls for them.

If `subscribe` throws, `onError` receives a `SubscribeFailed` report, and the evaluation does not fail. The next evaluation tries to attach again.

To run your own code on a change, listen on the reader:

```typescript
const stop = flags.subscribe((keys) => console.log("changed", keys ?? "all"))
```

## Turn off request coalescing

By default, concurrent evaluations with the same evaluation key share one provider call. If the provider has a side effect for each call, such as exposure logging, turn coalescing off:

```typescript
const flags = createFlags({ provider, identify, cache: { coalesce: false } })
```

To keep coalescing and still track each exposure, use an `after` hook. See [How to observe evaluations with hooks](./observe-evaluations-with-hooks.md#track-exposures).

## Include more identity fields in the key

The default evaluation key holds the provider's `name`, the flag key, the flag kind, the variants, and the type and value of `distinctId`. If other identity fields change the decision, give a `key` function:

```typescript
const flags = createFlags({
  provider,
  identify,
  cache: {
    store,
    key: ({ flag, identity }) => JSON.stringify([flag.key, identity?.distinctId, identity?.plan]),
  },
})
```

The function replaces the whole default key. Return the same key only for evaluations that can share one provider decision. The package never calls it for an anonymous evaluation.

[About flag evaluation](../explanation/about-flag-evaluation.md#concurrent-evaluations-share-provider-work) explains the store and coalescing model.
