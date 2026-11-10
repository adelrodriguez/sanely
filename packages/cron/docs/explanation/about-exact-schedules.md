# About exact schedules

`@sanely/cron` accepts a schedule only when one standard 5-field cron expression runs at exactly its times. This is the exactness rule. This page explains why the package rejects a schedule instead of giving a cron expression that is close, and why each limit on a schedule follows from the rule.

## Why reject instead of approximate

A cron expression is easy to write and hard to read. `*/7 * * * *` looks like "every 7 minutes", but cron reads `*/7` in the minute field as the minutes 0, 7, 14, and so on to 56. After :56 the next run is at :00 of the next hour, four minutes later. A scheduler that runs the expression does not warn you about the short gap once an hour.

The package could convert `every 7 minutes` to that expression and leave the gap to you. It rejects the schedule instead, and the reason says which intervals work: `7 does not divide 60. Use 2, 3, 4, 5, 6, 10, 12, 15, 20, or 30`. An error when you write the schedule costs less than a job that runs at the wrong times. For a schedule in code, the error is a type error, so you see it before the code runs.

The same rule makes the phrase and the expression agree. Each schedule maps to exactly one cron expression, and `describe` writes the schedule back as one cron phrase. What you read in the phrase is what the scheduler runs.

## How each limit follows from the rule

Each limit on a schedule exists because cron cannot express the alternative exactly.

An interval must divide the next larger unit. A minute interval divides 60, and an hour interval divides 24. Any other interval leaves a short gap at the end of each hour or each day, as `*/7` does. An interval longer than the cycle, such as 90 minutes, has no single cron expression at all, because the minute field and the hour field select their values independently.

An interval has a fixed phase. A minute interval starts at :00 of each hour, and an hour interval starts at 00:00 of each day. Cron counts a step from the start of its field, so `*/15` always means :00, :15, :30, and :45.

A window is on whole hours, and its end is not included. A window limits the hour field, so `between 9:00 and 17:00` becomes the hours 9 to 16, and runs from 9:00 to 16:59. A start at 9:30 would need a different minute list for the first hour, and one expression has one minute list. An end of midnight is the end of the day.

A day of the month is 1 to 28. Days 29 to 31 do not occur in every month, so a schedule for the 31st would skip some months.

A month schedule has no day set. When a cron expression has both a day of the month and a day of the week, cron runs on a day that matches either one, not both. `on the 1st of every month on weekdays` would run on the 1st and on every weekday.

A list of days is a set. The order and duplicates do not change the times, so `describe` writes the days in calendar order, Monday first, and `cron` writes each day once.

## What exact means in time

A schedule is exact in wall-clock time, not in elapsed time. `every day at 9:30` runs when the clock shows 9:30. On a day when daylight saving time starts or stops, the time between two runs can change.

A schedule has no time zone. The scheduler that runs the cron expression sets the time zone, and the package does not need to know it.

See the [`@sanely/cron` reference](../reference.md) for the values that each part of a schedule accepts.
