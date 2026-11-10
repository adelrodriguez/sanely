---
"@sanely/cron": minor
---

Publish `@sanely/cron` as the successor to `plaincron`

`@sanely/cron` replaces `plaincron@0.1.0`. It keeps the cron-phrase language and its exact conversions, and adds the `Schedule` object as the one model of a schedule. `cron` accepts a `Schedule` or a cron phrase literal, and `describe` writes a schedule back as a cron phrase in the strict form.

To move from `plaincron`:

- `parse` and `safeParse` return a `Schedule` instead of a cron expression. Pass the result to `cron`, as in `cron(parse(input))`.
- `InvalidCronPhraseError` is now `InvalidScheduleError`. Besides `value`, it has `reason` and `path`.
- Replace `isValidCronPhrase(value)` with `safeParse(value) !== null`. `isCronPhrase` has no replacement, and `isSchedule` checks a schedule object instead.
- `cron` returns a `CronExpression`, a `string` that only `cron` makes. It still works anywhere a `string` does, but a function typed to return `ReturnType<typeof cron>` can no longer return another string. Type a stored cron expression as `string`.
- `DaySet` is now the day set of a `Schedule`: `"weekdays"`, `"weekends"`, or a list of day names such as `["monday", "friday"]`. In `plaincron`, `DaySet` was the text after `every` in a cron phrase, such as `"weekday"` or `"monday and friday"`.
- The `DayNameList`, `OnDaySet`, `Ordinal`, and `Shortcut` types are no longer exported.
