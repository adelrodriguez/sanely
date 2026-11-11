# Duration

`@sanely/duration` is a TypeScript package with no external dependencies. It converts human-readable time expressions to numeric durations and formats numeric durations as human-readable expressions.

## Language

**Time expression**:
A string that contains one numeric value and one supported time unit, such as `"30s"` or `"1 hour"`.
_Avoid_: Duration string, time string

**Compound time expression**:
A string that contains multiple time-expression segments, such as `"1h 30m"`.
_Avoid_: Complex expression, duration string

**Segment**:
One numeric value and unit within a compound time expression.
_Avoid_: Part, token

**Bare number**:
A time expression with no unit, such as `"500"`. A bare number means milliseconds, so only `ms`,
`parse`, and `safeParse` accept one.
_Avoid_: Unitless number

**Duration**:
A number in a known unit, typed `Duration<U>`, such as the result of `seconds("1h")`. `format`
takes a plain number or a duration in milliseconds.
_Avoid_: Branded number, tagged number

**Unit function**:
A public conversion function named for its output unit, such as `seconds` or `days`. Unit
functions wrap `convert`.
_Avoid_: Parser, formatter

**Unit name**:
The canonical long plural name of a unit, such as `"seconds"`. Used by `convert` and the `units`
format option.
_Avoid_: Unit key, unit id

**Strict form**:
The grammar that the `isTimeExpression` guard and the unit functions accept: at most one space,
and lowercase, Capitalized, or UPPERCASE units, except `M`. The `TimeExpression` type alone accepts
some extra strings, such as `"0x10h"`. The unit functions check the exact grammar of a literal.
_Avoid_: Canonical form

**Lenient form**:
The superset grammar that `parse` accepts: case-insensitive units, except `M`, and flexible
whitespace.
_Avoid_: Loose form

**Short form**:
An expression that uses an abbreviated unit, such as `"1h"`.
_Avoid_: Compact format

**Long form**:
An expression that uses a full unit name, such as `"1 hour"`.
_Avoid_: Verbose format

**Precision**:
The maximum number of segments that `format` returns.
_Avoid_: Decimal precision, accuracy

**Package consumer**:
A person or project that installs and uses `@sanely/duration`.
_Avoid_: User, package author
