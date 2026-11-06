# Stores take a command function, not a client

Superseded by [0007](0007-each-client-has-its-own-store.md).

`redisStore` takes `send: (command, args) => Promise<unknown>` instead of a client object, and narrows every reply at runtime. ioredis (`redis.call(command, args)`) and Bun (`redis.send(command, args)`) both fit without a type assertion, and the package imports neither client's types. Accepting Upstash-shaped clients would have needed an assertion, because their `evalsha` returns a generic type. Future SQL stores follow the same pattern with a `query` function.
