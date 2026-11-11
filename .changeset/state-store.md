---
"@sanely/ratelimit": minor
---

Add `stateStore` to build a store on a database transaction

`stateStore({ update, clear })` takes an atomic read and write of one key, and the package applies the algorithm and decides what to save. A store for Postgres, SQLite, or a Durable Object no longer has to copy the arithmetic of the built-in stores. A saved value that is not a `State` counts as no state. The `State` and `StateStoreOptions` types are exported too.
