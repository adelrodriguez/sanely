---
"@sanely/flags": minor
---

Tell invalid decisions apart by `problem`, and throw `FlagDefinitionError` for invalid `FlagsProvider` cache options

`InvalidDecisionError` has a `problem` field: `"malformed"`, `"kind"`, `"variant"`, `"payload"`, or `"missing"`. Before, a caller could tell these apart only by matching the `reason` text. `FlagsProvider` throws `FlagDefinitionError`, like `createFlags`, for an invalid `cache` option, instead of a `RangeError`.

To migrate, catch `FlagDefinitionError` where you caught `RangeError` from `FlagsProvider`.
