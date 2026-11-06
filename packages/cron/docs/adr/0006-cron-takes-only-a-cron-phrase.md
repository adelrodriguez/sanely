# `cron` takes only a cron phrase

The API has the same shape as Humanspan. `cron(phrase)` takes only a `CronPhrase`, the same as `ms(value)` takes only a `TimeExpression`. A plain `string` is a type error: use `parse` or `safeParse` for it, or narrow it with `isCronPhrase` first. At runtime, `cron` uses the same lenient parser as `parse`, so a value from untyped JavaScript gives the same result.

The first spec accepted a plain `string` in the typed function (then named `toCron`). We changed this so that each function has one job: `cron` is for phrases in code that the type checker checks, and `parse` is for input that only the runtime can check. A consumer who reads `cron(x)` knows that the type checker checked `x`.
