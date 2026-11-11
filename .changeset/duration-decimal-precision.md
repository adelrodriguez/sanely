---
"@sanely/duration": patch
---

Read decimal time expressions as the exact milliseconds they name

`parse("1.1h")` returned `3960000.0000000005` instead of `3960000`, because floating-point multiplication rounded twice. A decimal time expression now reads as its exact value, rounded once, so an expression that names a whole number of milliseconds returns that whole number. `convert`, `safeParse`, and the unit functions get the same fix.
