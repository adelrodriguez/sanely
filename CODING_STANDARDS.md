# Coding standards

These standards cover decisions that automated checks cannot make.
The [package structure reference](docs/agents/package-structure.md) describes the source, test, and import rules that lint checks enforce.

## Domain documentation

### Keep implementation maps out of package glossaries

Keep module ownership and compatibility details in the package's `docs/architecture.md`, and keep domain definitions in its `GLOSSARY.md`.
This keeps the package vocabulary useful when its source files move.

Spot it: A glossary change adds a source tree, a module ownership list, or build-check instructions beside domain definitions.

```text
<!-- Avoid: packages/errors/GLOSSARY.md before PR #44 -->

## Codebase Map

└── lib/
    ├── errors.ts             # Library error classes
    ├── fault.ts              # Fault, isFault, and Fault encoding

<!-- Prefer: packages/errors/docs/architecture.md -->

## Module ownership

| Module      | Ownership                                                                             |
| ----------- | ------------------------------------------------------------------------------------- |
| `errors.ts` | The package's tagged error classes.                                                   |
| `fault.ts`  | Fault instances, cause traversal, encoding, original stacks, and reserved-key checks. |
```

Evidence: [PR #44](https://github.com/adelrodriguez/sanely/pull/44) moved the source map and compatibility details out of the errors glossary.

## Code structure

### Create a value only in the mode that uses it

When a value serves only one mode, create it only in that mode, and let its absence stand for the other modes.
A value that exists in every mode needs a mode check wherever it is read, and that check hides which modes can reach it.

Spot it: A value is created in every mode, and the code that reads it also checks the mode.

```ts
// Avoid: packages/ratelimit/src/lib/limiter/build-limiter.ts, where a dry-run limiter never stores a denial
const blocks = (options.cache ?? defaults.cache ?? true) ? blockedCache() : undefined
const blocked = mode === "enforce" ? blocks?.lookup(key, cost) : undefined

// Prefer
const blocks =
  mode === "enforce" && (options.cache ?? defaults.cache ?? true) ? blockedCache() : undefined
const blocked = blocks?.lookup(key, cost)
```

Evidence: [PR #119](https://github.com/adelrodriguez/sanely/pull/119) made `SignalController` and `TimeoutController` in `@sanely/try` exist only when a call has a signal or a deadline, which removed their no-signal branches.
