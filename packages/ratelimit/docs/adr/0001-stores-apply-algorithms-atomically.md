# Stores apply algorithms atomically

A store receives the whole algorithm and applies it in one indivisible step: a Lua script in Redis, and in the future a single `INSERT … ON CONFLICT … RETURNING` statement in SQL or a `findOneAndUpdate` in MongoDB. We rejected a generic key-value contract (get, set, increment) because a read followed by a write lets concurrent requests pass the limit: with hono-rate-limiter's unstorage store, 20 of 20 concurrent requests passed a limit of 5. For the same reason, unstorage drivers cannot be stores.

## Consequences

Each store implements every algorithm it supports, so the work grows with algorithms times stores. A shared conformance test suite keeps their behaviour identical. The `Store` type takes the algorithms it supports as a type parameter, so a store that lacks one is a compile error at the limiter, not a runtime surprise.
