# How to validate a schedule from user input

This guide shows you how to turn a schedule that a person or a stored record gives you at runtime into a cron expression. The input can be a cron phrase from a form field, or a schedule object from JSON.

1. Pass the input to `parse`, and pass the result to `cron`. `parse` accepts a cron phrase in the strict form or the lenient form, so `"Every 15 Mins On Weekdays"` works. It also accepts a schedule object:

   ```ts
   import { cron, parse } from "@sanely/cron"

   const schedule = parse(form.schedule) // a Schedule, or throws InvalidScheduleError
   queue.upsertJobScheduler(id, { pattern: cron(schedule) })
   ```

   Don't pass the raw string to `cron`. A plain `string` is a type error.

2. To tell the person what is wrong, catch `InvalidScheduleError` and show its `reason`. For a schedule object, `path` names the key that failed, such as `["at", "hour"]`:

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

   If you only need to know whether the input is valid, use `safeParse` instead. It returns `null` instead of throwing:

   ```ts
   import { safeParse } from "@sanely/cron"

   const schedule = safeParse(form.schedule)
   if (schedule === null) return { field: "schedule", error: "Not a valid schedule" }
   ```

3. Store the `Schedule` object as JSON. When you read it back, pass it to `parse` again, because stored data can change outside your program.

4. To show a stored schedule to a person, pass it to `describe`. It returns the canonical cron phrase, such as `"every monday, wednesday and friday at 8:00"`. Parsing that phrase returns the same schedule, with its day lists in calendar order and without duplicates.

See the [`@sanely/cron` reference](../reference.md#the-cron-phrase-language) for the full lenient form, and [`InvalidScheduleError`](../reference.md#invalidscheduleerror) for the error properties.
