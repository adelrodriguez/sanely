# @sanely/flags

## 0.1.0

### Minor Changes

- e57180e: Key the React flag cache by `distinctId` and the reader's cache `key` function, so `FlagsProvider` renders any identity

  The flag cache serialized the whole `identity` prop of `FlagsProvider`, and it threw a `TypeError` during render for a `Date`, a `bigint`, a `Set`, or a class instance, even though `Identity` allows them and `createFlags` accepts them on the server. The flag cache now keys an identity the way the reader's store keys a decision: by the type and value of `distinctId`, and by what the reader's `cache.key` function returns for each flag. It reads no other identity field, so `FlagsProvider` renders every identity that `Identity` allows.

  This changes when the flag cache reads new values. Before, a change to any field of the `identity` prop started new cached values. Now, an identity with the same `distinctId` reuses the cached values unless the reader's `key` function returns the changed field. To read new values when a field such as a plan changes, return it from `key`:

  ```ts
  const flags = createFlags({
    provider,
    cache: { key: ({ identity }) => [identity?.plan] },
  })
  ```

- e57180e: Delete a flag's stored decisions across processes with `DecisionStore.deleteFlags`

  A change notification deleted only the stored decisions that the reader had read or written since it started, and the reader remembered each of those keys until its flag changed. A decision that another process stored was served stale until the store expired it. A store can now implement `deleteFlags(flagKeys?)`, which the package calls for each change, and `set` receives the decision's `flagKey` so the store can find a flag's entries. The reader keeps no index of keys anymore, so a store without `deleteFlags` keeps its decisions after a change until it expires them, and `delete` only removes one stored decision, one that no longer fits its flag or that a fresh read replaces. `memoryStore` implements `deleteFlags`.

  A `StoreFailed` report for a failed `deleteFlags` has `operation: "deleteFlags"` and `flagKeys`, and no `key` or `identity`. To migrate a custom store that relied on `delete` for change notifications, implement `deleteFlags`. Accept the third `set` argument, and narrow a `StoreFailed` report on `operation` before reading `key`.

- e57180e: Dispose a reader with `flags.dispose()` or `using flags = createFlags(...)`

  A reader attached a listener to its provider on its first identified read and never removed it, so a server that made one reader per request kept every reader alive and ran every one of them on each change notification. Readers now have `dispose()`, also available through `using`, which drops the reader's decision memory and detaches the provider. If the provider's detach function throws, `dispose()` rethrows the error after the decision memory is gone. Create one reader for the process, or dispose a reader that you make for one request.

- e57180e: Tell invalid decisions apart by `problem`, and throw `FlagDefinitionError` for invalid `FlagsProvider` cache options

  `InvalidDecisionError` has a `problem` field: `"malformed"`, `"kind"`, `"variant"`, `"payload"`, or `"missing"`. Before, a caller could tell these apart only by matching the `reason` text. `FlagsProvider` throws `FlagDefinitionError`, like `createFlags`, for an invalid `cache` option, instead of a `RangeError`.

  To migrate, catch `FlagDefinitionError` where you caught `RangeError` from `FlagsProvider`.

- e57180e: Read past the store with `fresh: true`, and make React `invalidate` and `clear()` do so

  `useFlagCache().invalidate(flags)` and `clear()` dropped React's cached values, but the next evaluation read the reader's store, so a Refresh button showed the stored value again. A read now takes `{ fresh: true }`, which deletes the stored decision with the store's `delete`, skips any provider call in flight, asks the provider, and stores its decision, so other reads never return the replaced one. `invalidate` and `clear()` use it for the next evaluation of the flags they drop.

- e57180e: Make a custom cache `key` add identity fields to the evaluation key instead of replacing it

  A `key` function that left out the flag key, such as `key: ({ identity }) => String(identity?.distinctId)`, made different flags share one stored decision and one in-flight provider call, so one flag returned another flag's value. `key` now returns only the identity fields that also change the decision, and the package keeps the provider, the flag, and the typed `distinctId` in the key. The key also starts with the provider's `name`, so readers with different providers can share one store. A decision stored under an old key is missed once.

  To migrate, return the extra fields as an array:

  ```ts
  // Before
  key: ({ flag, identity }) => JSON.stringify([flag.key, identity?.distinctId, identity?.plan])
  // After
  key: ({ identity }) => [identity?.plan]
  ```

  `FlagCacheKey`, the type of each value, is exported from `@sanely/flags`.

- 8606247: Accept time expressions such as `"500ms"` for timeouts and cache lifetimes, and drop the `Ms` suffix from their names

  `flag.boolean("checkout", false, { timeout: "300ms" })` is the same as `timeout: 300`, and `createFlags({ provider, timeout: "1s" })` is the same as `timeout: 1000`. `FlagsProvider` takes `cache={{ ttl: "5m", pendingTtl: "30s" }}`. The type checker checks a literal expression with `@sanely/duration`, so `"1M"` fails to compile with the reason. A string from config needs `isTimeExpression` from `@sanely/duration` first. `flag.boolean`, `flag.variant`, and `createFlags` throw `FlagDefinitionError` for a string that is not a time expression, and so does `FlagsProvider`.

  To migrate, rename `timeoutMs` to `timeout`, `ttlMs` to `ttl`, and `pendingTtlMs` to `pendingTtl`. A flag definition's `timeoutMs` and `EvaluationTimeoutError`'s `timeoutMs` are now `timeout`, and they still hold milliseconds.

  `@sanely/flags` now depends on `@sanely/duration`.

### Patch Changes

- 21503dc: Fix cases where a reader or `FlagsProvider` silently returned a wrong or stale flag value

  - A decision whose payload the flag's parser rejects is no longer stored. A stored one is reported as `validate`, deleted, and sent to the provider.
  - A coalesced provider call stores its decision even when the evaluation that started it left first.
  - `identifyWith` and `for` reject an identity whose `distinctId` is not a non-empty string or a finite number, so such identities never share decisions.
  - A change notification that is not an array of flag keys counts as a change to every flag.
  - `useFlagCache().invalidate` and `clear()` keep re-rendering readers that React subscribed again, as in strict mode.
  - `FlagsProvider` ignores a snapshot or snapshot entry that does not parse, evaluates entries that the server made without an identity, and keeps dropped snapshot values dropped when it remounts.

- Updated dependencies [a72bd6a]
- Updated dependencies [a72bd6a]
- Updated dependencies [e6ab5a0]
- Updated dependencies [a72bd6a]
- Updated dependencies [a72bd6a]
  - @sanely/duration@0.1.0
