---
"@sanely/duration": minor
---

Reject a bare number unless the result is milliseconds

A bare number, such as `"30"`, means milliseconds. `seconds("30")` returned `0.03`, which is rarely what the caller means. Now the unit functions other than `ms` need a unit, so `seconds("30")` is a type error. `convert("30", "seconds")` throws `InvalidTimeExpressionError`. `ms`, `parse`, `safeParse`, and `convert(value, "milliseconds")` still accept a bare number.

To migrate, add the unit you mean, such as `seconds("30s")`. After `isTimeExpression` narrows a string, call `ms(input)`, or use `convert(input, "seconds")` for another unit.
