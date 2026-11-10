# Architecture

Core is a private workspace with named domain exports. Its only entry point is `src/time.ts`, exported as `@sanely/core/time`.
The [glossary](../GLOSSARY.md) defines the shared time vocabulary.

## Module ownership

| Module                  | Ownership                                                  |
| ----------------------- | ---------------------------------------------------------- |
| `lib/time/constants.ts` | Millisecond conversion constants and nominal clock ratios. |
| `lib/time/table.ts`     | Unit definitions, aliases, and private lookup maps.        |
| `lib/time/types.ts`     | Unit alias types derived from the table.                   |

The unit table is ordered from largest to smallest for duration formatting.
Month and year multipliers are fixed lengths. Cron uses the minute and hour vocabulary and clock ratios; it owns its calendar rules.

## Dependency boundaries

Cron, duration, ratelimit, and skew import core through `@sanely/core/time`. Core does not import any of these libraries.
Package exports keep implementation paths private. Oxlint checks the package direction and prevents implementation modules from importing their own entry point.
The core build rejects third-party bundles and external package imports.

Consumers declare core as a workspace development dependency and bundle its JavaScript and declarations.
Their builds reject external package imports in both outputs. Core has no npm publication or release lifecycle.

See the [contributor guide](../../../CONTRIBUTING.md#share-internal-code) for consumer setup and the [testing guide](testing.md) for verification.
