# About exact schedules

`@sanely/cron` follows one rule, the exactness rule. A schedule is valid only when one standard 5-field cron expression runs at exactly its times. The package never gives a cron expression that runs at other times, so it rejects every schedule that one cron expression cannot express exactly. This page explains where that rule draws its lines, and what "exact" does not cover.

## Why some intervals are errors

A cron field counts from the start of its cycle again at each new cycle. The minute field restarts at :00 of each hour, and the hour field restarts at 00:00 of each day. An interval that does not divide the cycle leaves a short gap at the restart. `*/7` in the minute field runs at :49 and :56, and then at :00 of the next hour, four minutes later. So `every 7 minutes` is an error, and the reason names the intervals that work.

For the same reason, an interval starts at the start of its cycle. A minute interval starts at :00 of each hour, and an hour interval starts at 00:00 of each day. An interval longer than its cycle, such as 90 minutes, needs more than one cron expression, so `every 90 minutes` is also an error.

## Why windows are on whole hours

A window limits the hour field, so its ends fall on whole hours. `between 9:00 and 17:00` becomes the hour range `9-16`, which runs from 9:00 to 16:59. The end is not included, so two windows that meet, such as 9 to 12 and 12 to 17, do not overlap. An end of 24 is midnight at the end of the day.

## Why days of the month stop at 28

Days 29 to 31 do not occur in every month. A cron expression for the 31st skips the months that have 30 days or fewer, so it does not run every month. The package accepts days 1 to 28, which occur in every month.

## Why a month schedule has no day set

When a cron expression has both a day of the month and a day of the week, cron runs on any day that matches either one. `0 9 1 * 1` runs on the 1st and on every Monday, not on a 1st that is a Monday. No cron expression means "the 1st, if it is a Monday", so a month schedule has no `on` key.

## Exact in wall-clock time

A schedule is exact in wall-clock time, not in elapsed time. On a day when daylight saving time starts or stops, the time between two runs can change. A schedule also has no time zone. The scheduler that runs the cron expression sets the time zone.

## Why the `CronPhrase` type is open

The `CronPhrase` type checks the sentence shape, the intervals, and the first word of each slot, and leaves the rest of each slot open. A type that listed every valid phrase would be a large union of template literal types. TypeScript compares those types in pairs when it reduces a union, such as the type of `[phrase, otherPhrase]`, and reports a large union as "too complex to represent". `cron` and `ValidateCronPhrase` still check the full phrase of a string literal, so the open slots do not let an invalid literal through.

See the [`@sanely/cron` reference](../reference.md) for the full list of keys, slots, and values.
