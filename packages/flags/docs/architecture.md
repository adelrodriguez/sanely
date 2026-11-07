# Architecture

The public entry points are `src/index.ts`, `src/hooks/index.ts`, and `src/integrations/react/index.tsx`.
They publish as `@sanely/flags`, `@sanely/flags/hooks`, and `@sanely/flags/react`.
The hooks entry point remains an independent type helper. The core does not import React.

## Domain ownership

| Domain               | Ownership                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| `factory/index.ts`   | Evaluator construction, factory membership, and typed batch results.                              |
| `config/`            | Identity resolution, hook snapshots, change broadcaster, and per-factory decision memory.         |
| `evaluation/`        | Evaluation calls, details, fallback, and batch flushes.                                           |
| `evaluation/stages/` | Hook lifecycle, cache operations, invalidation, and request coalescing.                           |
| `flag/`              | Flag configuration, decision construction and validation, evaluation keys, and evaluator records. |
| `promise-cache/`     | Promise-cache keys and helpers for integrations.                                                  |
| `shared/`            | Errors, signals, reporting, and cross-domain utilities.                                           |
| `types/`             | Type contracts with no runtime implementation.                                                    |

The factory sits above evaluation and configuration. Neither lower domain imports the factory.
Evaluation uses configuration, flag modules, shared modules, and types. Its stages cannot import the evaluation engine.
Configuration and flag modules use shared modules and types. Shared modules use types.
The promise-cache domain imports no other library domain. The root lint configuration owns these dependency rules.

## State and entry points

The flag registry has one evaluator `WeakMap`, shared by the core and React entry points.
Resolved configuration owns each factory's decision memory and broadcaster.
Evaluation owns each call's lifecycle, cancellation, timeout, fallback, and details.
React owns its default cache, provider cache isolation, change clocks, and subscriptions.

The React integration uses flag records, promise-cache helpers, shared modules, and types.
Its source and built entry retain the `use client` directive. React remains an optional peer.
The hooks entry point has no runtime dependency on evaluation.

See the [package structure rules](../../../docs/agents/package-structure.md) and [test requirements](testing.md).
