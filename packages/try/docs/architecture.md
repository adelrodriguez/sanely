# Architecture

The public entry points remain `src/index.ts`, `src/errors.ts`, and `src/types.ts`.
The root entry point binds the terminal execution APIs and policy builders to one `RunBuilder` instance.

## Domain ownership

| Domain                 | Ownership                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| `builder/index.ts`     | The policy builder and its typed terminal execution API.                                   |
| `policies/`            | Policy options, retry normalization, cancellation, and total deadlines.                    |
| `execution/`           | Sync and async terminal execution and their common base.                                   |
| `orchestration/`       | Task graphs, the settlement of `all`, `allSettled`, and `flow`, and orchestration results. |
| `composition/index.ts` | Generator composition and cleanup after a short-circuit.                                   |
| `disposal/index.ts`    | Disposal symbols, stack state, and LIFO cleanup.                                           |
| `shared/`              | Canonical error classes and cross-domain utilities.                                        |

`policies/options.ts` is the single owner of configuration, execution context, retry-policy, and literal-validation types.
It imports no upper domain. Execution modules need no import from the builder.

`policies/milliseconds.ts` reads a retry delay or a deadline given as a time expression with `@sanely/duration`.
The builder and `retryOptions` read each value once, so `BuilderConfig` and execution hold milliseconds.
Duration is a runtime dependency, so a consumer that also imports it shares one copy.
The build keeps it external, and `build:verify` installs it from its own tarball.

The root lint configuration enforces this dependency direction at every depth, including type imports:

```text
builder       -> orchestration, execution, policies, shared
orchestration -> execution, policies, shared, disposal
execution     -> policies, shared, disposal
policies      -> shared, disposal
composition   -> shared
shared        -> disposal
disposal      -> no other domain
```

## Orchestration

One `TaskGraph` runs every orchestration API. The APIs differ only in their settlement, a row of the `settlements` table in `orchestration/settlement.ts`:

- `exits`: whether tasks can end the graph with `$exit`.
- `stops`: which task events stop the graph and abort the other tasks. A Panic always stops it.
- `settle`: the graph's value when every task settled and nothing stopped it.

Dependencies inside the domain point one way:

```text
orchestrate.ts -> task-graph.ts -> settlement.ts
flow.ts        -> task-graph.ts
```

`orchestrate()` owns the rules that every terminal call shares: this call's own deadline and cancellation, `catch` mapping, and reporting the outcome as a value. To add an orchestration API, add a settlement row and a builder method.

## State and compatibility

Each builder owns its configuration. Each execution owns its attempt context, timer, and signal controllers.
Each task graph owns its state, task outcomes, `$result` deferreds, first Panic, task signal, and disposer. Each generator invocation owns its iterator.
The disposal domain owns each cleanup stack and the runtime symbol aliases.

Policy failures retain their result-union types and bypass domain-failure mapping.
Panics retain their thrown behavior. Cancellation keeps precedence over timeout.
Task graphs settle in-flight work before returning or rejecting.

See the [package structure rules](../../../docs/agents/package-structure.md) and [test requirements](testing.md).
