---
"@sanely/rpc": minor
---

Fix `connect` sessions that share one wire taking each other's replies and cancels

Every session numbered its calls from 0, so two sessions calling over the same MessagePort or socket could resolve a call with the other session's result. Each message now carries a protocol marker, `rpc: 1`, and the calling session's id, and a session settles only with the replies to its own calls. A message without the marker is ignored as foreign traffic.

This changes the wire format, and a peer on 0.0.0 ignores the new messages. To migrate, upgrade both ends of every wire together. A wire still has one serving end: to serve several routers over it, combine them with `mergeRouters`.
