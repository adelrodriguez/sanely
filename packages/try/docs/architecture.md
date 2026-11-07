# Architecture

The public entry points remain `src/index.ts`, `src/errors.ts`, and `src/types.ts`.
The root entry point binds the terminal execution APIs and policy builders to one `RunBuilder` instance.

## Domain ownership

| Domain                 | Ownership                                                               |
| ---------------------- | ----------------------------------------------------------------------- |
| `builder/index.ts`     | The policy builder and its typed terminal execution API.                |
| `policies/`            | Policy options, retry normalization, cancellation, and total deadlines. |
| `execution/`           | Sync and async terminal execution and their common base.                |
| `orchestration/`       | Task graphs, `all`, `allSettled`, and `flow`.                           |
| `composition/index.ts` | Generator composition and cleanup after a short-circuit.                |
| `disposal/index.ts`    | Disposal symbols, stack state, and LIFO cleanup.                        |
| `shared/`              | Canonical error classes and cross-domain utilities.                     |

`policies/options.ts` is the single owner of configuration, execution context, retry-policy, and literal-validation types.
It imports no upper domain. Execution modules need no import from the builder.

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

## State and compatibility

Each builder owns its configuration. Each execution owns its attempt context, timer, and signal controllers.
Each task graph owns its settlement state and disposer. Each generator invocation owns its iterator.
The disposal domain owns each cleanup stack and the runtime symbol aliases.

Policy failures retain their result-union types and bypass domain-failure mapping.
Panics retain their thrown behavior. Cancellation keeps precedence over timeout.
Task graphs settle in-flight work before returning or rejecting.

See the [package structure rules](../../../docs/agents/package-structure.md) and [test requirements](testing.md).
