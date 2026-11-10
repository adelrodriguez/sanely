---
"@sanely/skew": patch
---

Declare `DEFAULT_CHECK_TIMEOUT` as `number`

`DEFAULT_CHECK_TIMEOUT` is still `30000` milliseconds, but its declared type is now `number` instead of the literal type `30000`. Code that reads it as a number is unaffected.
