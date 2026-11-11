---
"@sanely/skew": patch
---

Read decimal `checkTimeout` and `checkInterval` values with `@sanely/duration`'s exact parsing

`@sanely/duration` now reads a decimal time expression such as `"1.1h"` as exactly `3960000`, so skew no longer rounds a parsed value itself.
