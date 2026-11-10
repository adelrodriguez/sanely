---
"@sanely/try": patch
---

Return the work's result whatever a `wrap` returns

A wrap that forgot to return `next()` made the call resolve with `undefined`. The call now returns the result of the work. A wrap that never calls `next()`, calls it twice, or throws or rejects throws a `Panic` with the code `WRAP_NEXT_NOT_CALLED`, `WRAP_NEXT_CALLED_TWICE`, or `WRAP_THROW`.
