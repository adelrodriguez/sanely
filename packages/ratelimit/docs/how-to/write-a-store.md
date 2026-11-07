# How to write a store

This guide shows you how to count in a database that the built-in stores do not support.

1. Make sure that the database can read and write a key in one atomic step, such as a transaction or a script. A read followed by a separate write is not enough, because concurrent requests then pass the limit together. For this reason, key-value abstractions such as unstorage drivers cannot be stores.

2. Implement the two functions of `Store`:

   ```typescript
   import type { Store } from "@sanely/ratelimit"

   const store: Store = {
     consume: async ({ key, algorithm, cost }) => {
       // Apply the algorithm atomically.
       return { success, remaining, reset, now }
     },
     clear: async (key) => {
       // Forget the key.
     },
   }
   ```

3. Follow these rules in `consume`:
   - Make each call atomic. Concurrent calls for one key, from any process, must behave as if they ran one after another.
   - Change nothing on a denial.
   - Read without writing when `cost` is 0.
   - Use the clock of the database, and return it as `now` in epoch milliseconds.
   - Match the arithmetic of the built-in stores in `src/lib/transitions/index.ts`.

4. If the store supports only some algorithms, declare them in the type. TypeScript then refuses the others:

   ```typescript
   import type { FixedWindow, Store } from "@sanely/ratelimit"

   const store: Store<FixedWindow> = postgresStore({ query })
   ```

Refer to the [`Store` reference](../reference.md#store) for the fields of the request and the result.
