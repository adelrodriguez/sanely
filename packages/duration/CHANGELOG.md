# @sanely/duration

## 0.1.0

### Minor Changes

- a72bd6a: Check the number grammar of a literal at compile time

  `ms("1.h")`, `ms(" 1h")`, and `seconds("0x10h")` compiled and then threw at runtime. The unit functions now check a literal with `ValidateTimeExpression<T>`, and the type error gives the reason, such as `a decimal point needs a digit after it`.

- a72bd6a: Reject a bare number unless the result is milliseconds

  A bare number, such as `"30"`, means milliseconds. `seconds("30")` returned `0.03`, which is rarely what the caller means. Now the unit functions other than `ms` need a unit, so `seconds("30")` is a type error. `convert("30", "seconds")` throws `InvalidTimeExpressionError`. `ms`, `parse`, `safeParse`, and `convert(value, "milliseconds")` still accept a bare number.

  To migrate, add the unit you mean, such as `seconds("30s")`. After `isTimeExpression` narrows a string, call `ms(input)`, or use `convert(input, "seconds")` for another unit.

- a72bd6a: Tag each result with its unit, so `format` rejects a value in the wrong unit

  `parse`, `safeParse`, `convert`, and the unit functions now return a `Duration<U>`, a number tagged with its unit. `format` takes a plain number or a `Duration<"milliseconds">`, so `format(seconds("1h"))` is a type error instead of the string `"4s"`. A `Duration` is still a `number`, and arithmetic on it gives a plain `number`.

  To migrate, pass milliseconds to `format`, such as `format(ms("1h"))` instead of `format(seconds("1h"))`.

- a72bd6a: Reject the unit `M`, which other notations read as months

  Units ignore case, so `ms("1M")` was one minute, and `parse("every 5 M")` in cron ran every 5 minutes. Moment, date-fns, and ISO 8601 use `M` for months. `M` is now an error in every form, with the hint `use "m" for minutes or "mo" for months`. `UnitAnyCase` no longer includes `"M"`.

  To migrate, write `m` for minutes or `mo` for months.

### Patch Changes

- e6ab5a0: Read decimal time expressions as the exact milliseconds they name

  `parse("1.1h")` returned `3960000.0000000005` instead of `3960000`, because floating-point multiplication rounded twice. A decimal time expression now reads as its exact value, rounded once, so an expression that names a whole number of milliseconds returns that whole number. A number with more significant digits than a JavaScript number holds exactly, about 15, still reads with floating-point error. `convert`, `safeParse`, and the unit functions get the same fix.
