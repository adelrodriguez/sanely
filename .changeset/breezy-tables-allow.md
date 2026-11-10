---
"@sanely/duration": minor
---

Check the number grammar of a literal at compile time

`ms("1.h")`, `ms(" 1h")`, and `seconds("0x10h")` compiled and then threw at runtime. The unit functions now check a literal with `ValidateTimeExpression<T>`, and the type error gives the reason, such as `a decimal point needs a digit after it`.
