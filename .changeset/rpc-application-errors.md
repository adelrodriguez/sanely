---
"@sanely/rpc": minor
---

Add the `ChannelError` code `application`, so a resolver can send its own failure with typed data to the caller

A resolver can now throw `new ChannelError({ code: "application", data })`. The error always crosses `toWire`, `connect`, and `fetchHandler` without an `expose` predicate, and the caller gets a `ChannelError` with the same `data`. `fetchHandler` answers it with status 422. Use `data` to carry a serialized error, such as one from a `@sanely/errors` registry, and rebuild it on the client.
