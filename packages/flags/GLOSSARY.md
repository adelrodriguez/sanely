# Gated Context

Gated is a provider-independent, type-safe feature-flag library for TypeScript applications. Package consumers supply identity resolution and provider decision logic. Gated executes the evaluation lifecycle, hooks, validation, and fallback behavior.

`buildGate` creates gate factories. Each evaluator resolves an identity, runs the complete hook lifecycle, obtains and validates a discriminated provider decision when needed, and returns a boolean or a configured variant. Identity resolution is strict by default and anonymous when the factory opts in. Evaluators expose `details()` for the decision source, payload, and fallback error. Call options support identity overrides and cancellation. Factory and per-gate timeouts return the configured default.

Factories can evaluate several of their own gates through `batch()`. A batch resolves the identity once, preserves per-gate lifecycle and fallback semantics, and uses the provider-level `decideMany` function when present. Cache and request coalescing are built-in behaviors. Hooks are observers.

React support is an optional integration at `@sanely/flags/react`. Components pass evaluators to `useGate`, `useGateBatch`, and `FeatureGate`. Batch results are synchronously readable and destructurable in flag order. React evaluation promises use a bounded gate cache with live invalidation and prefetch support. `GateProvider` isolates the cache for server rendering and supplies a default identity. Components that call a gate hook need a Suspense boundary. `FeatureGate` supplies one when `loading` is present.

Use the vocabulary below in code, tests, issues, and documentation. The package's public entry points are `@sanely/flags`, `@sanely/flags/hooks`, and `@sanely/flags/react`.

## Language

| Term                    | Meaning                                                                                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **gate factory**        | The callable object returned from `buildGate`. It creates evaluators and owns `batch()`; batches accept only evaluators from that same factory.                                                                                 |
| **gate / evaluator**    | An async callable created by a gate factory and configured with a key, default value, optional variants, and optional timeout. It also exposes `details()`.                                                                     |
| **decision**            | A provider or cached result with an explicit `type` discriminant: either `{ type: "boolean", value: boolean }` or `{ type: "variant", variant: string, payload?: IdentityValue }`.                                              |
| **boolean decision**    | A `type: "boolean"` decision that evaluates a boolean gate.                                                                                                                                                                     |
| **variant decision**    | A `type: "variant"` decision that evaluates a gate with configured string variants. Its variant must be allowed; optional payload is available through evaluation details.                                                      |
| **evaluation details**  | A result containing the returned value, flag key, and source (`cache`, `provider`, or `default`), plus a variant payload or fallback error when present.                                                                        |
| **identity**            | The provider-specific subject used for evaluation. It extends `Identity`, which requires `distinctId`. Resolution is strict unless the factory opts into anonymous evaluation, where hooks and providers may receive `null`.    |
| **hook**                | A lifecycle observer with optional `before`, `after`, `error`, and `finally` handlers. `after` receives decision-source metadata.                                                                                               |
| **evaluation key**      | The collision-safe string that cache and request coalescing use to identify one flag and identity evaluation. It includes the gate shape and typed `distinctId` by default. A consumer `evaluationKey` function can replace it. |
| **cache**               | Built-in behavior that reads a decision before provider work and writes the decision from the provider call after commit. The store owns serialization and expiry.                                                              |
| **request coalescing**  | Built-in behavior that lets concurrent evaluations with one flag, compatible gate shape, and identity share provider work after cache reads. Each evaluation keeps its own error, fallback, and cancellation path.              |
| **change broadcaster**  | The gate factory's single attachment to the consumer `subscribe` function. It sends each change notification to invalidation and to every `changes` listener, and it attaches at most once at a time.                           |
| **leader / follower**   | The request-coalescing roles for one evaluation key. The leader calls the provider and writes the cache. Followers attach to the leader's in-flight call and reuse its decision.                                                |
| **batch**               | The synchronously readable, destructurable tuple produced by evaluating several gates together after one identity resolution and an optional provider-level `decideMany` call. React reaches it through `useGateBatch`.         |
| **gate cache**          | The bounded React promise cache created by `createGateCache`. It owns invalidation, clearing, and prefetch operations.                                                                                                          |
| **gate provider**       | The React provider that isolates a gate cache per mount and can supply a default identity to descendant gate hooks.                                                                                                             |
| **integration**         | An optional framework-facing package surface built on the core API, such as the React integration.                                                                                                                              |
| **package consumer**    | An application or library that installs Gated and imports its published package entry points.                                                                                                                                   |
| **public entry points** | The supported import paths: `@sanely/flags`, `@sanely/flags/hooks`, and `@sanely/flags/react`.                                                                                                                                  |

Call the provider result a decision, not a "flag value", when the difference from the gate's returned value matters.
