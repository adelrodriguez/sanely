# Architecture

`src/index.ts` selects the public exports from the library domains.
The [glossary](../GLOSSARY.md) defines the Schedule model and the package language.

## Domain ownership

| Domain                                    | Ownership                                                              |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| `api/`                                    | Public calls, input dispatch, type guards, and `InvalidScheduleError`. |
| `validate/index.ts`                       | Runtime validation of schedule objects.                                |
| `normalize/index.ts`                      | Conversion of lenient cron phrases to the strict form.                 |
| `grammar/index.ts` and `grammar/types.ts` | Runtime phrase parsing and compile-time phrase validation.             |
| `describe/index.ts`                       | Writing a schedule as a cron phrase.                                   |
| `serialize/index.ts`                      | Writing cron fields as a cron expression.                              |
| `fields/index.ts`                         | Conversion of schedules to cron fields.                                |
| `schedule/`                               | Schedule types, schedule matching, and validation reasons and paths.   |
| `vocabulary/`                             | Words, value tuples, slot types, and slot guards.                      |

Dependencies point from vocabulary through schedule, fields, and serialization to the phrase domains, validation, and public calls.
Grammar and description are independent domains. Neither imports the other.
The Oxlint domain declarations enforce this direction, including type imports.
Implementation modules do not import the public entry point.

## Shared time definitions

`@sanely/core/time` owns time unit aliases and nominal clock ratios.
The normalizer selects its minute and hour definitions from the shared unit table.
Vocabulary, schedule rules, validation, grammar, and description use its clock ratios. Cron owns accepted intervals, calendar rules, and errors.

Core is a workspace development dependency. The build bundles its JavaScript and declarations and rejects external package imports in both outputs.
Consumers install cron on its own, with no runtime dependencies.

Use the [package structure reference](../../../docs/agents/package-structure.md) for file names and imports, and the [testing guide](testing.md) for test placement.
See the [core architecture](../../core/docs/architecture.md) for the shared definitions.
