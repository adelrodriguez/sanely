---
"@sanely/try": patch
---

Infer a union returned by a `run()` `try` or `catch` without explicit type arguments

A `catch` such as `(error) => (error instanceof TypeError ? new BusyError() : new InternalError())` now gives `BusyError | InternalError` in the result union instead of a type error.
