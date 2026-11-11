---
"@sanely/try": minor
---

Keep `runSync` unavailable when `retry` follows `timeout` or `signal`

`timeout(100).retry(3).runSync(fn)` used to compile, although `runSync` cannot stop synchronous work at a deadline or a cancellation. It is now a type error, as `timeout(100).runSync(fn)` already was. Use `run` for work that needs a deadline or a signal.
