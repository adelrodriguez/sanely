---
"@sanely/rpc": patch
---

Fix `createClient`, `createRouter`, and `implement` accepting a contract with reserved or dotted keys when it skips `defineContract`

A plain object contract with a key such as `"a.b"` beside a nested `a.b` leaf made one channel silently replace the other. These functions now throw the same `SetupError` as `defineContract`, with code `dotted-key` or `reserved-key`.
