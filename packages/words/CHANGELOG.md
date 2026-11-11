# @sanely/words

## 0.1.0

### Minor Changes

- 383df92: Add `generate` and `count` to build friendly, safe-for-work names such as `"amber-fox"`

  `generate()` joins an adjective or a color with a noun from curated word lists. Pass `segments` for up to 16 words, or `pattern` to pick the list for each word, such as `["color", "animal"]`. The type checker rejects a list name that doesn't exist. Use `lists` to add custom lists, `omit` to exclude words, `maxLength` to limit the length, and `random` for a seeded source of randomness. `count()` returns the exact number of distinct names as a `bigint`. Invalid options throw `InvalidOptionError`, and options that no name satisfies throw `NotEnoughWordsError`.
