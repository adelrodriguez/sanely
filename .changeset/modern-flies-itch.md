---
"@sanely/rpc": minor
---

Fix `connect` sessions that share one wire taking each other's replies and cancels

Every session numbered its calls from 0, so two sessions calling over the same MessagePort or socket could resolve a call with the other session's result. Each message now carries a protocol marker, `rpc: 1`, and the calling session's id, and a session settles only with the replies to its own calls. A message without the marker is ignored as foreign traffic.

A session without a `router` no longer answers requests. It used to reply with a `ChannelError` with code `no-router`, which reached the caller before the real result when a serving session shared its end of the wire. The `no-router` code is removed, and a call to a wire with no serving end now fails with `timeout`.

This changes the wire format, and a peer on 0.0.0 ignores the new messages. To migrate:

1. Upgrade both ends of every wire together.
2. Remove any handling of the `no-router` code.
3. Serve several routers over one wire from one session, by combining them with `mergeRouters`.
