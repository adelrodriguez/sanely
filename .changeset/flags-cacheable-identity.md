---
"@sanely/flags": minor
---

Key the React flag cache by `distinctId` and the reader's cache `key` function, so `FlagsProvider` renders any identity

The flag cache serialized the whole `identity` prop of `FlagsProvider`, and it threw a `TypeError` during render for a `Date`, a `bigint`, a `Set`, or a class instance, even though `Identity` allows them and `createFlags` accepts them on the server. The flag cache now keys an identity the way the reader's store keys a decision: by the type and value of `distinctId`, and by what the reader's `cache.key` function returns for each flag. It reads no other identity field, so `FlagsProvider` renders every identity that `Identity` allows.

This changes when the flag cache reads new values. Before, a change to any field of the `identity` prop started new cached values. Now, an identity with the same `distinctId` reuses the cached values unless the reader's `key` function returns the changed field. To read new values when a field such as a plan changes, return it from `key`:

```ts
const flags = createFlags({
  provider,
  cache: { key: ({ identity }) => [identity?.plan] },
})
```
