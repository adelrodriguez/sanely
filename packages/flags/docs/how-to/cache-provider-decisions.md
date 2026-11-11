# How to cache provider decisions

This guide shows you how to store provider decisions, drop them when the provider reports a change, and control which evaluations share a decision.

## Add a store

1. Write a store with `get`, `set`, and optionally `delete` and `deleteFlags`. The store controls serialization and expiry. This one stamps each decision with a version for its flag. `deleteFlags` advances the version, and `get` ignores a decision with an older one, so there is no index to keep in step with writes, and old decisions leave with their expiry:

   ```typescript
   import type { DecisionStore, Decision } from "@sanely/flags"

   type Entry = { decision: Decision; flagKey: string; version: string }

   // A notification without keys advances the version of every flag at once.
   async function versionOf(flagKey: string): Promise<string> {
     const [all, flag] = await redis.mget<[number | null, number | null]>(
       "flag-version",
       `flag-version:${flagKey}`
     )
     return `${all ?? 0}.${flag ?? 0}`
   }

   const store: DecisionStore = {
     get: async (key) => {
       const entry = await redis.get<Entry>(key)
       return entry && entry.version === (await versionOf(entry.flagKey)) ? entry.decision : null
     },
     set: async (key, decision, { flagKey }) => {
       await redis.set(key, { decision, flagKey, version: await versionOf(flagKey) }, { ex: 60 })
     },
     delete: (key) => redis.del(key),
     deleteFlags: async (flagKeys) => {
       const versions = flagKeys?.map((flagKey) => `flag-version:${flagKey}`) ?? ["flag-version"]
       await Promise.all(versions.map((version) => redis.incr(version)))
     },
   }
   ```

   A write that read the version before a change stores the old version, so `get` never returns it.

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

The default evaluation key holds the provider's `name`, the flag key, the flag kind, the variants, and the type and value of `distinctId`. If other identity fields change the decision, give a `key` function that returns them. Each field needs a type that `FlagCacheKey` allows in the provider's identity type, such as the `plan` union here:

```typescript
// The provider's identity parameter is annotated with this type.
type UserIdentity = Identity & { plan: "free" | "pro" }

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

A [`FlagsProvider`](./use-flags-in-react.md#choose-what-starts-new-cached-values) keys its flag cache with the same function, so a field that the function returns also starts new cached values in React.

[About flag evaluation](../explanation/about-flag-evaluation.md#concurrent-evaluations-share-provider-work) explains the store and coalescing model.
