# How to write a store

This guide shows you how to count in a database that the built-in stores do not support.

1. Make sure that the database can read and write a key in one atomic step, such as a transaction or a script. A read followed by a separate write is not enough, because concurrent requests then pass the limit together. For this reason, key-value abstractions such as unstorage drivers cannot be stores.

2. If the database runs JavaScript inside its transaction, such as Postgres or SQLite, build the store with `stateStore`. For Cloudflare Durable Objects, use the [built-in store](count-in-durable-objects.md). Read the saved value and the database clock, call `apply`, and save the state it returns, all in one transaction:

   ```typescript
   import { stateStore } from "@sanely/ratelimit"

   const store = stateStore({
     update: (key, apply) =>
       sql.begin(async (tx) => {
         await tx`insert into rate_limits (key) values (${key}) on conflict do nothing`
         const [row] = await tx`
           select state, (extract(epoch from clock_timestamp()) * 1000)::bigint as now
           from rate_limits where key = ${key} for update`
         const { result, state } = apply(row.state, Number(row.now))

         if (state) {
           await tx`update rate_limits set state = ${sql.json(state)}, expires_at = ${state.expiresAt}
             where key = ${key}`
         }

         return result
       }),
     clear: async (key) => {
       await sql`delete from rate_limits where key = ${key}`
     },
   })
   ```

   The package applies the algorithm, and saves nothing after a denial or for a cost of 0. Delete rows whose `expires_at` has passed whenever it suits you.

3. If the database runs its own scripts instead, as Redis runs Lua, implement the two functions of `Store` and follow these rules in `consume`:
   - Make each call atomic. Concurrent calls for one key, from any process, must behave as if they ran one after another.
   - Change nothing on a denial.
   - Read without writing when `cost` is 0.
   - Use the clock of the database, and return it as `now` in epoch milliseconds.
   - Match the arithmetic of the built-in stores, which the Redis scripts in `src/lib/stores/redis/` repeat line for line.

4. If the store supports only some algorithms, declare them in the type. TypeScript then refuses the others:

   ```typescript
   import type { FixedWindow, Store } from "@sanely/ratelimit"

   const store: Store<FixedWindow> = postgresStore({ query })
   ```

Refer to the [`Store` reference](../reference.md#store) for the fields of the request and the result.
