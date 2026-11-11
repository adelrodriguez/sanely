---
"@sanely/rpc": minor
---

Reject a `connect` `timeoutMs` that isn't a positive number or `Infinity`

`NaN`, such as from an unset environment variable, turned the timeout off, so calls to a dead peer waited forever. Zero or a negative value timed out every call at once. `connect` now throws a `SetupError` with the new code `invalid-timeout`.

If you switch over every `SetupError` code, add a case for `invalid-timeout`.
