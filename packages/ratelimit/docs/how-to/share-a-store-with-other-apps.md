# How to share a store with other apps

This guide shows you how to keep the counts of several apps or services apart in one Redis or Valkey server.

Limiters with the same name share counts when they use the same store. To keep apps apart, give each limiter factory its own `prefix`:

```typescript
const limiter = buildLimiter({ store, prefix: "billing" })

limiter({ name: "api:ip", algorithm }) // keys start with "billing:api:ip:"
```

The prefix goes before the limiter name in every key, joined with `:`. Limiters share counts when `prefix:name` and the identity match. For example, prefix `a:b` with name `c` shares counts with prefix `a` with name `b:c`.

The prefix must be printable ASCII. Results and headers do not show it.

If your Redis client sets a `keyPrefix`, the client adds it before the prefix.
