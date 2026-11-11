---
"@sanely/flags": minor
---

Delete a flag's stored decisions across processes with `DecisionStore.deleteFlags`

A change notification deleted only the stored decisions that the reader had read or written since it started, and the reader remembered each of those keys until its flag changed. A decision that another process stored was served stale until the store expired it. A store can now implement `deleteFlags(flagKeys?)`, which the package calls for each change, and `set` receives the decision's `flagKey` so the store can find a flag's entries. The reader keeps no index of keys anymore, so a store without `deleteFlags` keeps its decisions after a change until it expires them, and `delete` only removes one stored decision, one that no longer fits its flag or that a fresh read replaces. `memoryStore` implements `deleteFlags`.

A `StoreFailed` report for a failed `deleteFlags` has `operation: "deleteFlags"` and `flagKeys`, and no `key` or `identity`. To migrate a custom store that relied on `delete` for change notifications, implement `deleteFlags`. Accept the third `set` argument, and narrow a `StoreFailed` report on `operation` before reading `key`.
