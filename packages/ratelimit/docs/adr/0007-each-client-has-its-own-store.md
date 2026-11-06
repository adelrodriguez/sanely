# Each client has its own store

Supersedes [0002](0002-stores-take-a-command-function-not-a-client.md).

Each Redis-protocol client has its own store, and the store takes the client as it is: `redisStore` takes an ioredis or node-redis client, `valkeyStore` an iovalkey client, and `bunRedisStore` a `Bun.RedisClient`. The user writes no adapter. Each store declares only the methods it calls, so the package still imports no client's types, and every client fits without a type assertion. Where a client has its own `evalsha`, `eval`, and `del` methods, the store calls those rather than a raw command method, because some clients apply their `keyPrefix` only through them (node-redis's `sendCommand` skips it, and iovalkey's `call` skips it for upper-case command names). All of them adapt their client to one internal `scriptStore`, so they run the same scripts and count the same way.

## Considered Options

- **A command function, `send: (command, args) => Promise<unknown>` (0002).** It fits any client, but every user writes the same one-line adapter, and the README has to show it for each client.
- **One store for every client.** It would tell every client apart by shape, and the checks grow fragile as clients are added: ioredis and node-redis both have `eval`, `del`, and `sendCommand`, with different signatures. `redisStore` tells only its two clients apart, by `evalsha`, which node-redis spells `evalSha`.

## Consequences

A new client gets its own store and its own CI job. Upstash Redis gets `upstashStore`, so `@upstash/redis` must fit without an adapter or a type assertion. Clients with a different command method, such as Valkey GLIDE, get a store that adapts that method.
