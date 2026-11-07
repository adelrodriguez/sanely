# Architecture

`src/index.ts` selects the public exports and re-exports the existing conversion constants and unit types from `@sanely/core/time`.
The [glossary](../GLOSSARY.md) defines the time expression language.

## Domain ownership

| Domain        | Ownership                                                                       |
| ------------- | ------------------------------------------------------------------------------- |
| `expression/` | Strict and lenient grammars, parsing, guards, and `InvalidTimeExpressionError`. |
| `convert/`    | Unit conversion and the public unit functions.                                  |
| `format/`     | Formatting numeric durations as time expressions.                               |

Convert depends on expression. Each domain imports the unit definitions or derived types it needs from core.
Oxlint enforces this direction, including type imports. Implementation modules do not import the public entry point.

## Shared time definitions

Core owns the unit table, aliases, conversion constants, and derived unit types.
Duration owns its parsing and formatting behavior, input validation, and errors.
The public constants, types, and import paths stay compatible.

Core is a workspace development dependency. The build bundles its JavaScript and declarations and rejects external package imports in both outputs.
Consumers install duration on its own, with no runtime dependencies.

See the [core architecture](../../core/docs/architecture.md), [testing guide](testing.md), and root [contributor guide](../../../CONTRIBUTING.md#share-internal-code).
