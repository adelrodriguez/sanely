---
"@sanely/rpc": patch
---

Fix reading an unknown `$` key on a client node, such as `$$typeof`, making a call that rejects unhandled

Only `$path`, `$input`, `$output`, and `$with` are helpers now. Every other `$` key is `undefined`, so tools that probe objects, such as Vitest's pretty-format and React's development checks, no longer trigger a call.
