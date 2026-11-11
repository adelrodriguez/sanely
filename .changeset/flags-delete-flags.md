---
"@sanely/flags": minor
---

Delete a flag's stored decisions across processes with `DecisionStore.deleteFlags`

A change notification deleted only the stored decisions that the reader had read or written since it started, and the reader remembered each of those keys until its flag changed. A decision that another process stored was served stale until the store expired it. A store can now implement `deleteFlags(flagKeys?)`, which the package calls for each change, and `set` receives the decision's `flagKey` so the store can find a flag's entries. With `deleteFlags`, the reader keeps no index of keys. `memoryStore` implements it.

A `StoreFailed` report for a failed `deleteFlags` has `operation: "deleteFlags"` and `flagKeys`, and no `key` or `identity`. To migrate a custom store, accept the third `set` argument, and narrow a `StoreFailed` report on `operation` before reading `key`.
