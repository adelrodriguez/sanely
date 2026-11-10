# About the forms of a time expression

`@sanely/duration` reads time expressions in two forms, the strict form and the lenient form. This page explains why there are two forms, how the type checker checks a literal, why a bare number needs a unit in most functions, why `M` is not a unit, and why months and years are approximations.

## Two forms for two jobs

A time expression in source code is written by a developer, and a type checker can see it. A time expression in user input, a config file, or an environment variable is written by anybody, and only a run-time check can see it.

The strict form is for the first case. It permits at most one space between the number and the unit, and units in lowercase, Capitalized, or UPPERCASE. A narrow grammar keeps the expressions in a codebase consistent, and it is small enough for a template literal type. `isTimeExpression` checks it exactly.

The lenient form is for the second case. `parse` ignores the case of units and permits flexible whitespace, so `"1   HOUR"` is valid. People type time expressions in many ways, and the lenient form accepts the common variations, such as `"1 Hour "` with a space at the end. The lenient form is a superset of the strict form, so `parse` accepts every strict expression.

## How the type checker checks a literal

TypeScript template literal types can say "a number, then a unit", but their `${number}` placeholder accepts more strings than the number grammar of the parser. For example, `"0x10h"` satisfies the `TimeExpression` type, because `"0x10"` is a number to TypeScript.

So the unit functions do not take `TimeExpression` alone. They take `ValidateTimeExpression<T>`, which reads a literal one character at a time with the same number grammar as the parser. `ms("0x10h")` and `ms("1.h")` are type errors, and the error gives the reason. `isTimeExpression` is the exact check at run time. The type also covers only one segment. For a compound expression, such as `"1h 30m"`, `convert` and `parse` take any `string` and check it at run time. When a value comes from outside the program, use the guard or `safeParse`. See [How to validate a time expression from user input](../how-to/validate-user-input.md).

## Why a bare number needs a unit in most functions

A bare number, such as `"30"`, means milliseconds. In `ms("30")` that is what the caller means. In `seconds("30")` the caller almost always means 30 seconds, and the result would be `0.03`. So only the functions that return milliseconds, `ms`, `parse`, and `safeParse`, accept a bare number. `seconds("30")` is a type error, and `convert("30", "seconds")` throws.

The result of each function is a `Duration` in its unit. `format` takes milliseconds, so `format(seconds("1h"))` is a type error instead of the string `"4s"`. A `Duration` is still a number, so an API that takes a number, such as `setTimeout`, accepts any `Duration`. Name the unit at the call site, such as `setTimeout(callback, ms("5m"))`.

## Why `M` is not a unit

The lenient form ignores the case of units, so `"M"` would be minutes. But moment, date-fns, and ISO 8601 use `M` for months, and a reader of `ms("1M")` can expect a month. So `M` is not a unit in any form. Write `m` for minutes or `mo` for months.

## Why months and years are approximations

A calendar month has 28 to 31 days, and a calendar year has 365 or 366 days. A duration in milliseconds has no calendar, so the package uses fixed averages: a year is 365.25 days, and a month is one twelfth of that year. This is correct on average, and it is not correct for one specific month.

For this reason, `format` can write `"1mo 1w"` for five weeks. When the output must be exact, limit `format` to units with a fixed length, such as weeks and days. See [How to format a duration for display](../how-to/format-a-duration.md#keep-the-output-exact).
