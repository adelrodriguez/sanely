# @sanely/ratelimit

## 0.1.0

### Minor Changes

- 1d4b05f: Reject algorithms written as object literals

  `FixedWindow`, `SlidingWindow`, and `TokenBucket` now carry a type brand that only `fixedWindow`, `slidingWindow`, and `tokenBucket` add, after they check their options. An object literal such as `{ type: "fixedWindow", limit: 10, window: 0 }` no longer compiles as an algorithm, because it skipped those checks and could produce resets that are not numbers and denials that never expire. Build each algorithm with its function instead.

- 1d4b05f: Keep a dry-run limiter's store error from stopping a chain of limiters

  When the store failed for a dry-run limiter, `rateLimit` returned that store error and skipped the enforced limiters after it. A dry-run limiter's store error now stays in `results`, and the chain goes on. It is the result only when no limiter allowed the request. `StoreErrorResult` now has `mode`, so middleware can tell a trial limiter's store error from an enforced one.

- 0cb0892: Add a store for Cloudflare Durable Objects

  `@sanely/ratelimit/stores/durable-object` exports `durableObjectStore` and the `RateLimitObject` class. Export the class from your Worker, bind it with SQLite storage, and pass the binding to `durableObjectStore`. Each key gets its own object, which runs each check atomically on its own clock and deletes its counts with an alarm when they expire. The entry point loads only in workerd.

- 2c820f1: Accept time expressions such as `"1h"` for `window`, `interval`, and `timeout`

  `fixedWindow({ limit: 100, window: "1m" })` is the same as `window: 60_000`. The type checker checks a literal expression with `@sanely/duration`, so `"1M"` fails to compile with the reason. A string from config needs `isTimeExpression` from `@sanely/duration` first. An expression that is not a whole positive number of milliseconds throws `InvalidOptionError` with the string as `value`.

  `@sanely/ratelimit` now depends on `@sanely/duration`.

- c3da613: Add `stateStore` to build a store on a database transaction

  `stateStore({ update, clear })` takes an atomic read and write of one key, and the package applies the algorithm and decides what to save. A store for Postgres, SQLite, or a Durable Object no longer has to copy the arithmetic of the built-in stores. A saved value that is not a `State` counts as no state. The `State` and `StateStoreOptions` types are exported too.

### Patch Changes

- 7c2eda2: Fix a fixed-window denial that reported negative units left after a limit was lowered

  When a limit in use dropped below the units already spent in the current window, the memory store reported a negative `remaining`, and the Redis stores returned a store error in place of the denial. The denial now reports 0 units left on every store.

- a17616c: Reject an invalid shared `timeout` when `buildLimiter` runs

  `buildLimiter({ store, timeout: 0 })` returned a limiter factory and threw `InvalidOptionError` only when the factory defined a limiter. It now throws at once, as it does for an invalid `prefix`. A `timeout` set on a limiter is still checked when the factory defines that limiter.

- 7c2eda2: Fix the Redis stores reading another algorithm's counts after a limiter changes algorithm

  The Redis, Valkey, and Bun Redis stores now count state that another algorithm wrote as no state, as the memory store does. A state written by an earlier version counts as no state once, on its first request after the upgrade.

- Updated dependencies [a72bd6a]
- Updated dependencies [a72bd6a]
- Updated dependencies [e6ab5a0]
- Updated dependencies [a72bd6a]
- Updated dependencies [a72bd6a]
  - @sanely/duration@0.1.0
