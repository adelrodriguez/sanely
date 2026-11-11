# How to cache provider decisions

This guide shows you how to store provider decisions, drop them when the provider reports a change, and control which evaluations share a decision.

## Add a store

1. Write a store with `get`, `set`, and optionally `delete` and `deleteFlags`. The store controls serialization and expiry. This one keeps a set of keys for each flag, so `deleteFlags` can find a flag's decisions:

   ```typescript
   import type { DecisionStore, Decision } from "@sanely/flags"

   const store: DecisionStore = {
     get: (key) => redis.get<Decision>(key),
     set: async (key, decision, { flagKey }) => {
       await redis.set(key, decision, { ex: 60 })
       await redis.sadd(`flag-keys:${flagKey}`, key)
       await redis.sadd("flag-keys", flagKey)
     },
     delete: (key) => redis.del(key),
     deleteFlags: async (flagKeys) => {
       for (const flagKey of flagKeys ?? (await redis.smembers("flag-keys"))) {
         const keys = await redis.smembers(`flag-keys:${flagKey}`)
         if (keys.length > 0) await redis.del(...keys, `flag-keys:${flagKey}`)
       }
     },
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
       if (report._tag === "StoreFailed") logger.warn(report.operation, report.error)
     },
   })
   ```

A store failure does not fail the evaluation. The package discards an invalid stored decision and asks the provider.

## Drop decisions when the provider changes a flag

Give the provider a [`subscribe` function](./write-a-provider.md#report-flag-changes). A change notification drops the running provider calls for the changed flags. With a store that has `deleteFlags`, it also deletes their stored decisions, including the ones that other processes stored. A store without `deleteFlags` keeps them until it expires them. See [`DecisionStore`](../reference.md#decisionstore).

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

The default evaluation key holds the provider's `name`, the flag key, the flag kind, the variants, and the type and value of `distinctId`. If other identity fields change the decision, give a `key` function that returns them:

```typescript
const flags = createFlags({
  provider,
  identify,
  cache: {
    store,
    key: ({ identity }) => [identity?.plan],
  },
})
```

The package adds the returned values to the default key, so two flags or two `distinctId` values never share a decision. Return strings, numbers, booleans, `null`, `undefined`, arrays, or plain records. Another value fails the key, which `onError` reports as a `StoreFailed` report with `operation: "key"`, and the evaluation then calls the provider without sharing. The package never calls the function for an anonymous evaluation.

[About flag evaluation](../explanation/about-flag-evaluation.md#concurrent-evaluations-share-provider-work) explains the store and coalescing model.
