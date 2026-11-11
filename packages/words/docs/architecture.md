# Architecture

`src/index.ts` selects the public exports.
The [glossary](../GLOSSARY.md) defines names, word lists, and patterns.

## Domain ownership

| Domain   | Ownership                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------ |
| `lists/` | The built-in word lists, `Category`, `isCategory`, and which categories hold prefixes and nouns. |
| `names/` | Option parsing, `generate`, `count`, the word groups they share, and the package errors.         |

Names depends on lists. Lists imports nothing.
Oxlint enforces this direction, including type imports. Implementation modules do not import the public entry point.

## Names

`options.ts` parses the options into one pool for each position of the name. Callers without types can pass any value, so it reads each option as `unknown` and throws `InvalidOptionError`.
Nothing after it checks options again.

`groups.ts` splits the words of the pools into groups of words that belong to exactly the same positions.
A name has few positions, so a few groups cover thousands of words.
`count` multiplies the sizes of the groups that can fill each position.
`generate` uses `shortestFill` to check that the rest of a name can still fit within `maxLength` before it accepts a word.
Within a group, the shortest unused words are always the best choice, so that search only decides how many words each group gives.

Default pools keep one identity for each word count, and `groupWords` caches groups by pool identity.
A default name therefore builds its groups once.
A pattern or `omit` builds new pools, and its groups, on each call.

## Word lists

Each built-in list is a module in `src/lib/lists/` that exports a `readonly string[]`.
`lists/index.ts` collects them into the frozen `lists` record, and `Category` derives from its keys.
To add a list, add its module and its entry in `lists`. Tests check that every list holds distinct lowercase words.
The [LICENSE](../LICENSE) records the sources of the lists.

See the [testing guide](testing.md) and the root [contributor guide](../../../CONTRIBUTING.md).
