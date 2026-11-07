# Testing

Module suites live in `src/lib/__tests__/` and match the source names in `src/lib/`.
Public contract suites live in `src/__tests__/` and call `src/index.ts`, `src/errors.ts`, or `src/types.ts`.
Serialization and regression suites stay at that public boundary because they combine several modules.

Public type changes need assertions in `src/__tests__/types.test-d.ts`.
The workspace `check` command checks these assertions. Vitest does not run them.
Build workspace dependencies before the workspace check.

`build:verify` packs and installs the package, checks its export sets, and checks a strict NodeNext consumer.
It also checks that root behavior and the error entry point share the same error constructors.
`test:compat` loads built exports with the compatibility script. CI runs it on the package's Node.js floor.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for commands and the [shared test placement rules](../../../docs/agents/package-structure.md#tests-and-benchmarks).
