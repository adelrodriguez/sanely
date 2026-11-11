---
"@sanely/rpc": patch
---

Fix one call on a pending wire closing the whole `connect` session when the wire cannot send its payload

A call queued before the wire arrived, such as one made before `whenOpen` resolves, could carry a payload the wire cannot send, like a BigInt over a WebSocket. When the wire arrived, that send closed the session and failed every other call. Now only that call rejects, with the wire's error, as it already did on a wire that was there from the start.
