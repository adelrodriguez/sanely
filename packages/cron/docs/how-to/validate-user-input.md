# How to validate a schedule from user input

This guide shows you how to turn a schedule that a person or a stored record gives you at runtime into a cron expression. The input can be a cron phrase from a form field, or a schedule object from JSON.

## Parse the input

Pass the input to `parse`. `parse` accepts a cron phrase in the strict form or the lenient form, so `"Every 15 Mins On Weekdays"` works. It also accepts a schedule object.

```ts
import { cron, parse } from "@sanely/cron"

const schedule = parse(form.schedule) // a Schedule, or throws InvalidScheduleError
queue.upsertJobScheduler(id, { pattern: cron(schedule) })
```

`cron` accepts the `Schedule` that `parse` returns. Do not pass the raw string to `cron`. A plain `string` is a type error.

## Show the reason to the person

If you want to tell the person what is wrong, catch `InvalidScheduleError` and show its `reason`. For a schedule object, `path` names the key that failed, such as `["at", "hour"]`.

```ts
import { InvalidScheduleError, parse } from "@sanely/cron"

try {
  return parse(form.schedule)
} catch (error) {
  if (error instanceof InvalidScheduleError) {
    return { field: "schedule", error: error.reason } // "7 does not divide 60. Use 2, 3, ..."
  }
  throw error
}
```

If you only need to know whether the input is valid, use `safeParse`. It returns `null` instead of throwing.

```ts
import { safeParse } from "@sanely/cron"

const schedule = safeParse(form.schedule)
if (schedule === null) return { field: "schedule", error: "Not a valid schedule" }
```

## Store and show the schedule

Store the `Schedule` object as JSON. When you read it back, pass it to `parse` again, because stored data can change outside your program.

To show a stored schedule to a person, pass it to `describe`. It returns the canonical cron phrase, such as `"every monday, wednesday and friday at 8:00"`, and `parse` of that phrase gives the same schedule.

See the [`@sanely/cron` reference](../reference.md#the-cron-phrase-language) for the full lenient form and the error properties.
