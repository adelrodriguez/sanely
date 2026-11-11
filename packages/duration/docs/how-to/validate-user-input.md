# How to validate a time expression from user input

This guide shows you how to accept a time expression from a form, a config file, or an environment variable, and reject it when it is not valid.

## Accept a compound time expression

If the input can have several segments, such as `"1h 30m"`, use `safeParse`. It returns milliseconds, or `null` for invalid input:

```ts
import { safeParse } from "@sanely/duration"

const timeout = safeParse(input)

if (timeout === null) {
  throw new Error(`TIMEOUT must be a time expression, such as "30s". Received: ${input}`)
}
```

If you prefer an error, use `parse` and catch `InvalidTimeExpressionError`. Its `value` property holds the input:

```ts
import { InvalidTimeExpressionError, parse } from "@sanely/duration"

try {
  parse(input)
} catch (error) {
  if (error instanceof InvalidTimeExpressionError) {
    console.error(error.message) // Invalid time expression: ... Received: "..."
  }
}
```

If you need to check the input but not its value, use `isValidTimeExpression(input)`.

## Accept one time expression for a unit function

The unit functions, such as `ms` and `seconds`, take a literal or a `TimeExpression`. A `string` from user input is not a `TimeExpression`, so narrow it first with `isTimeExpression`:

```ts
import { isTimeExpression, ms } from "@sanely/duration"

if (isTimeExpression(input)) {
  ms(input) // TypeScript knows that input is a TimeExpression
}
```

A narrowed `TimeExpression` can be a bare number, which means milliseconds, so only `ms` takes it. For another unit, use `convert(input, "seconds")`, which throws `InvalidTimeExpressionError` for a bare number.

`isTimeExpression` accepts only the strict form: at most one space between the number and the unit, and a unit in lowercase, Capitalized, or UPPERCASE, such as `"1 hour"` or `"1 HOUR"`. It rejects `"1h 30m"` and `"1   HOUR"`. To accept those, use `safeParse` as above, or `convert(input, "seconds")`.

Refer to the [grammar reference](../reference.md#grammar) for the full rules of each form.
