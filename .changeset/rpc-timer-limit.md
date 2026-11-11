---
"@sanely/rpc": patch
---

Reject a `connect` timeout above 24.8 days instead of timing out every call at once

`setTimeout` cannot hold a delay above 2,147,483,647 ms and fires a longer one after about 1 ms. `connect(wire, { timeoutMs: 3_000_000_000 })` used to time out every call almost immediately. It now throws a `SetupError` with the code `invalid-timeout`. Pass `Infinity` to turn the timeout off.
