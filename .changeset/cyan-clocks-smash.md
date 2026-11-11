---
"@sanely/rpc": patch
---

Return `undefined` for unknown `$` properties on client nodes

Reading an inspection property such as `$$typeof` no longer starts an RPC call that rejects without a handler. The `$with`, `$path`, `$input`, and `$output` helpers keep their behavior.
