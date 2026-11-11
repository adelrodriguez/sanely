---
"@sanely/rpc": minor
---

Reject a `connect` `timeout` that isn't a positive length of time up to 24.8 days or `Infinity`

`NaN`, such as from an unset environment variable, turned the timeout off, so calls to a dead peer waited forever. Zero, a negative value, or a value above 2,147,483,647 ms, the longest delay `setTimeout` holds, timed out every call at once. `connect` now throws a `SetupError` with the new code `invalid-timeout`.

If you switch over every `SetupError` code, add a case for `invalid-timeout`.
