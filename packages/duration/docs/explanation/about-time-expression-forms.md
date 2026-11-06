# About the forms of a time expression

`@sanely/duration` reads time expressions in two forms, the strict form and the lenient form. This page explains why there are two forms, why the `TimeExpression` type is only a best-effort check, and why months and years are approximations.

## Two forms for two jobs

A time expression in source code is written by a developer, and a type checker can see it. A time expression in user input, a config file, or an environment variable is written by anybody, and only a run-time check can see it.

The strict form is for the first case. It permits at most one space between the number and the unit, and units in lowercase, Capitalized, or UPPERCASE. A narrow grammar keeps the expressions in a codebase consistent, and it is small enough for a template literal type. `isTimeExpression` checks it exactly.

The lenient form is for the second case. `parse` ignores the case of units and permits flexible whitespace, so `"1   HOUR"` is valid. People type time expressions in many ways, and the lenient form accepts the common variations, such as `"1 Hour "` with a space at the end. The lenient form is a superset of the strict form, so `parse` accepts every strict expression.

## Why the `TimeExpression` type is best effort

TypeScript template literal types can say "a number, then a unit", but their `${number}` placeholder accepts more strings than the number grammar of the parser. For example, `"0x10h"` satisfies the type, because `"0x10"` is a number to TypeScript. The parser rejects it, and `ms("0x10h")` throws at run time.

So the type catches typos in literals, such as `ms("1hr30")` or `ms("hello")`, at compile time, and `isTimeExpression` is the exact check. The type also covers only one segment. For a compound expression, such as `"1h 30m"`, `convert` and `parse` take any `string` and check it at run time. When a value comes from outside the program, use the guard or `safeParse`. See [How to validate a time expression from user input](../how-to/validate-user-input.md).

## Why months and years are approximations

A calendar month has 28 to 31 days, and a calendar year has 365 or 366 days. A duration in milliseconds has no calendar, so the package uses fixed averages: a year is 365.25 days, and a month is one twelfth of that year. This is correct on average, and it is not correct for one specific month.

For this reason, `format` can write `"1mo 1w"` for five weeks. When the output must be exact, limit `format` to units with a fixed length, such as weeks and days. See [How to format a duration for display](../how-to/format-a-duration.md#keep-the-output-exact).
