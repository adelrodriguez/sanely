# Architecture

The public entry points are `src/index.ts`, `src/integrations/react/index.tsx`, and `src/testing/index.ts`.
They publish as `@sanely/flags`, `@sanely/flags/react`, and `@sanely/flags/testing`.
The core does not import React.
`#lib/shared` reads a timeout or a cache lifetime given as a time expression with `@sanely/duration`. It is a runtime dependency, so a consumer that also imports duration shares one copy. The build keeps it external, and `build:verify` installs it from its own tarball.

## Domain ownership

| Domain           | Ownership                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------- |
| `errors/`        | The tagged evaluation errors and `FlagDefinitionError`.                                     |
| `changes/`       | The change broadcaster.                                                                     |
| `shared/`        | Signals, background reporting, and error normalization.                                     |
| `definition/`    | Flag definitions and their validation, decisions, decision validation, and payload parsing. |
| `identity/`      | Identity types, `anonymous`, the evaluation context, and identity sources.                  |
| `provider/`      | `defineProvider`, provider validation, and the engine's view of a provider.                 |
| `sharing/`       | The decision store, request coalescing, evaluation keys, and store invalidation.            |
| `evaluation/`    | Hooks, one evaluation, and batches with their flush rounds.                                 |
| `flags/`         | `createFlags`, readers, `for`, `subscribe`, snapshots, and error reports.                   |
| `promise-cache/` | Promise-cache keys and helpers for integrations.                                            |

## Dependency order

Each domain imports only itself and the domains that the root `oxlint.config.ts` lists for it:

| Domain           | Imports                                                              |
| ---------------- | -------------------------------------------------------------------- |
| `errors/`        | Nothing.                                                             |
| `changes/`       | Nothing.                                                             |
| `promise-cache/` | Nothing.                                                             |
| `shared/`        | `errors`.                                                            |
| `definition/`    | `errors`, `shared`.                                                  |
| `identity/`      | `definition`, `errors`, `shared`.                                    |
| `provider/`      | `changes`, `definition`, `errors`, `identity`, `shared`.             |
| `sharing/`       | `changes`, `definition`, `identity`, `shared`.                       |
| `evaluation/`    | `definition`, `errors`, `identity`, `provider`, `shared`, `sharing`. |
| `flags/`         | Every domain above except `promise-cache`.                           |

No library domain imports an entry point. The root lint configuration enforces these rules.

## State and entry points

Each `createFlags` call owns its decision memory and its change broadcaster, so two readers never share state.
Evaluation owns each call's lifecycle, cancellation, timeout, fallback, and details.
Flag definitions and providers are frozen values with no state.
React owns each `FlagsProvider` mount's flag cache, the change clocks of each reader, and subscriptions.

The React integration uses flag definitions, readers, identity helpers, and promise-cache helpers.
Its source and built entry keep the `use client` directive. React remains an optional peer.
The testing entry point builds on `defineProvider` and the store type.

See the [package structure rules](../../../docs/agents/package-structure.md) and [test requirements](testing.md).
