---
"@sanely/duration": minor
---

Tag each result with its unit, so `format` rejects a value in the wrong unit

`parse`, `safeParse`, `convert`, and the unit functions now return a `Duration<U>`, a number tagged with its unit. `format` takes a plain number or a `Duration<"milliseconds">`, so `format(seconds("1h"))` is a type error instead of the string `"4s"`. A `Duration` is still a `number`, and arithmetic on it gives a plain `number`.

To migrate, pass milliseconds to `format`, such as `format(ms("1h"))` instead of `format(seconds("1h"))`.
