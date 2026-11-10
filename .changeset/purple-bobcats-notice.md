---
"@sanely/cron": minor
---

Publish `@sanely/cron` as the successor to `plaincron`

`@sanely/cron` replaces `plaincron@0.1.0`. It keeps the cron-phrase language and its exact conversions, and adds the `Schedule` object as the one model of a schedule. `cron` accepts a `Schedule` or a cron phrase literal, and `describe` writes a schedule back as its canonical cron phrase.

To move from `plaincron`:

- `parse` and `safeParse` return a `Schedule` instead of a cron expression. Pass the result to `cron`, as in `cron(parse(input))`.
- `InvalidCronPhraseError` is now `InvalidScheduleError`. Besides `value`, it has `reason` and `path`.
- Replace `isValidCronPhrase(value)` with `safeParse(value) !== null`. `isCronPhrase` has no replacement, and `isSchedule` checks a schedule object instead.
- The `DayNameList`, `OnDaySet`, `Ordinal`, and `Shortcut` types are no longer exported.
