# @sanely/cron

## 0.1.0

### Minor Changes

- a72bd6a: Reject the unit `M`, which other notations read as months

  Units ignore case, so `ms("1M")` was one minute, and `parse("every 5 M")` in cron ran every 5 minutes. Moment, date-fns, and ISO 8601 use `M` for months. `M` is now an error in every form, with the hint `use "m" for minutes or "mo" for months`. `UnitAnyCase` no longer includes `"M"`.

  To migrate, write `m` for minutes or `mo` for months.

- dca12a4: Accept `undefined` for the optional keys of a `Schedule`

  `interval`, `between`, and `on` now accept `undefined`, the same as a missing key. Parsing already treated `undefined` this way. With `exactOptionalPropertyTypes` on, you can now build a schedule from optional values, such as `{ every: "hour", on: weekendsOnly ? "weekends" : undefined }`. A value that `isSchedule` narrows also no longer claims that a present key is defined.

  If your project enables `exactOptionalPropertyTypes` and reads one of these keys after an `in` check, such as `"on" in schedule`, check the value for `undefined` too:

  ```ts
  if (schedule.every === "minute" && schedule.on !== undefined) {
    useDays(schedule.on)
  }
  ```

- 754d56f: Publish `@sanely/cron` as the successor to `plaincron`

  `@sanely/cron` replaces `plaincron@0.1.0`. It keeps the cron-phrase language and its exact conversions, and adds the `Schedule` object as the one model of a schedule. `cron` accepts a `Schedule` or a cron phrase literal, and `describe` writes a schedule back as a cron phrase in the strict form.

  To move from `plaincron`:

  - `parse` and `safeParse` return a `Schedule` instead of a cron expression. Pass the result to `cron`, as in `cron(parse(input))`.
  - `InvalidCronPhraseError` is now `InvalidScheduleError`. Besides `value`, it has `reason` and `path`.
  - Replace `isValidCronPhrase(value)` with `safeParse(value) !== null`. `isCronPhrase` has no replacement, and `isSchedule` checks a schedule object instead.
  - `cron` returns a `CronExpression`, a `string` that only `cron` makes. It still works anywhere a `string` does, but a function typed to return `ReturnType<typeof cron>` can no longer return another string. Type a stored cron expression as `string`.
  - `DaySet` is now the day set of a `Schedule`: `"weekdays"`, `"weekends"`, or a list of day names such as `["monday", "friday"]`. In `plaincron`, `DaySet` was the text after `every` in a cron phrase, such as `"weekday"` or `"monday and friday"`.
  - `CronPhrase` checks the sentence shape, the intervals, and the first word of each slot, and leaves the rest of each slot open, so that the type stays fast to check. A literal such as `"every monday nonsense at 9:00"` matches it. To check a full phrase literal, pass it to `cron` or use `ValidateCronPhrase`.
  - The `DayNameList`, `OnDaySet`, `Ordinal`, and `Shortcut` types are no longer exported.

### Patch Changes

- 3a9755f: Give the same reason at the type level as at runtime for a phrase that ends before a clause is complete

  `cron("every 15 minutes on")` now fails with `expected a day set after "every 15 minutes on"`, the same reason that `parse` gives. The type-level reasons now match the runtime for an empty day set, a day list that ends in "and", a day set that starts at "at", a window that ends after "and", and "on the" without a day of the month. Before, some of these named the wrong word, such as `expected "and"` when "and" was already in the phrase.

  A day of the month without "of every month" after it, such as `parse("on the 1st of")`, now fails with `expected "of every month" after "on the 1st"` at runtime too, instead of naming only the next missing word.
