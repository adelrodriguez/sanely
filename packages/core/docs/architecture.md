# Architecture

Core is a private workspace with one entry point, `src/time.ts`, exported as `@sanely/core/time`.
The [glossary](../GLOSSARY.md) defines the shared time vocabulary.

## Module ownership

| Module                  | Ownership                                                                      |
| ----------------------- | ------------------------------------------------------------------------------ |
| `lib/time/constants.ts` | Millisecond conversion constants and nominal clock ratios.                     |
| `lib/time/table.ts`     | The unit table, unit aliases, and the `getUnitMs` and `getUnitByName` lookups. |
| `lib/time/types.ts`     | Unit alias types derived from the unit table.                                  |

The unit table lists units from largest to smallest, which is the order that duration's `format` reads it in.
Month and year multipliers are the fixed lengths that the glossary defines, not calendar lengths.

## Consumers

Each library uses a different part of `@sanely/core/time`.

| Library   | Uses                                                                                    |
| --------- | --------------------------------------------------------------------------------------- |
| cron      | The minute and hour aliases and the nominal clock ratios. Cron owns its calendar rules. |
| duration  | The unit table, the alias lookups, the conversion constants, and the alias types.       |
| ratelimit | `MS_PER_SECOND` and `MS_PER_MINUTE`.                                                    |
| skew      | `MS_PER_SECOND` and `MS_PER_MINUTE`.                                                    |

## Dependency boundaries

Libraries import core only through `@sanely/core/time`, and core imports no library.
The package exports keep implementation paths private.

These checks enforce the boundaries:

- Oxlint rejects an import of another Sanely package from core, and an import of core's entry point from its implementation modules.
- In a library that depends on core, the `project/clock-ratios` lint rule rejects a clock ratio, such as `60` or `1000`, written as a literal.
- The core build rejects bundled third-party code and every external package import.
- Each library bundles core's JavaScript and declarations, so its build output never imports `@sanely/core`. Cron, duration, and ratelimit allow no external imports. Skew allows only its framework peer dependencies.

Core has no npm publication or release lifecycle.
See [Share internal code](../../../CONTRIBUTING.md#share-internal-code) for consumer setup and the [testing guide](testing.md) for verification.
