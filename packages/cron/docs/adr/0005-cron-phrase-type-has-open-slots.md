# The CronPhrase type has open slots

`CronPhrase` is a union of template literal types. The sentence shapes, intervals, ordinals, and the day set after `every` are exact. The time slots and the clauses of an interval (after `on` and `between`) are `${string}`. `cron` takes a type parameter, and the `ValidateCronPhrase` validator checks the exact phrase of a string literal, with a readable reason.

A union with all day sets and times in it has thousands of template literal members. TypeScript compares these members in pairs when it reduces a union, for example for the type of `[phrase, otherPhrase]`. Above about 100,000 comparisons, TypeScript reports "Expression produces a union type that is too complex to represent". With the open slots, the union is small, and a check of 1,000 phrases takes less than one second (see `pnpm run test:types-perf`).

## Consequences

- `const phrase: CronPhrase = "every day at 25:00"` is not a type error. `cron("every day at 25:00")` is a type error.
- Do not add exact day sets or times to `CronPhrase` without a check of union reduction and of `pnpm run test:types-perf`.
