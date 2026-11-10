---
"@sanely/cron": minor
---

Accept `undefined` for the optional keys of a `Schedule`

`interval`, `between`, and `on` now accept `undefined`, the same as a missing key. Parsing already treated `undefined` this way. With `exactOptionalPropertyTypes` on, you can now build a schedule from optional values, such as `{ every: "hour", on: weekendsOnly ? "weekends" : undefined }`. A value that `isSchedule` narrows also no longer claims that a present key is defined.

If your project enables `exactOptionalPropertyTypes` and reads one of these keys after an `in` check, such as `"on" in schedule`, check the value for `undefined` too:

```ts
if (schedule.every === "minute" && schedule.on !== undefined) {
  useDays(schedule.on)
}
```
