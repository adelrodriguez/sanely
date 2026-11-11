---
"@sanely/flags": minor
---

Make a custom cache `key` add identity fields to the evaluation key instead of replacing it

A `key` function that left out the flag key, such as `key: ({ identity }) => String(identity?.distinctId)`, made different flags share one stored decision and one in-flight provider call, so one flag returned another flag's value. `key` now returns only the identity fields that also change the decision, and the package keeps the provider, the flag, and the typed `distinctId` in the key. The key also starts with the provider's `name`, so readers with different providers can share one store. A decision stored under an old key is missed once.

To migrate, return the extra fields as an array:

```ts
// Before
key: ({ flag, identity }) => JSON.stringify([flag.key, identity?.distinctId, identity?.plan])
// After
key: ({ identity }) => [identity?.plan]
```

`FlagCacheKey`, the type of each value, is exported from `@sanely/flags`.
