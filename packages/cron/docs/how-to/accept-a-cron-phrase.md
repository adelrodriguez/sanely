# How to accept a cron phrase in your own function

This guide shows you how to write a function that takes a cron phrase literal and checks it at compile time, as `cron` does.

## Type the parameter with `ValidateCronPhrase`

Declare a type parameter `T extends string`, and type the phrase parameter as `ValidateCronPhrase<T>`. A valid literal keeps its type, and an invalid literal is a type error that gives the reason.

```ts
import type { ValidateCronPhrase } from "@sanely/cron"

function schedule<T extends string>(phrase: ValidateCronPhrase<T>, job: () => void) {
  // ...
}

schedule("every weekday at 9:00", sendReport) // OK
schedule("every weekday at 9", sendReport)
// Argument of type '"every weekday at 9"' is not assignable to parameter of type
// '"\"9\" is not a valid time. Write the minutes, such as \"9:00\", and use 24-hour time or am/pm"'.
```

## Convert the phrase with `parse`

Inside the function, pass the phrase to `parse`, and pass the result to `cron`. `cron(phrase)` is a type error here, because TypeScript cannot check `ValidateCronPhrase<T>` for an unknown `T`.

```ts
import { cron, parse, type CronExpression, type ValidateCronPhrase } from "@sanely/cron"

function toCron<T extends string>(phrase: ValidateCronPhrase<T>): CronExpression {
  return cron(parse(phrase))
}
```

`parse` checks the phrase again at runtime. That check also catches a caller that skips the type checker, such as JavaScript code or a cast.

See the [`@sanely/cron` reference](../reference.md#types) for `ValidateCronPhrase` and `CronPhrase`.
