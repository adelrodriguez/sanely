# Testing

Module suites live in adjacent `__tests__/` folders and match the source file names.
A domain's `index.ts` module has an `index.test.ts` suite.
Grammar and validation tables use `index.table.ts`. Schedule generators for property tests use `index.arbitrary.ts`.

Public export checks and type assertions live in `src/__tests__/`.
The workspace `check` command checks type assertions. Vitest does not run them.
The architecture suite checks test ownership and coverage. Import direction is checked by lint.

Property tests check exact run times, round trips from a schedule to its cron phrase and back to its canonical form, and JSON schedule round trips.
Keep the grammar table shared between runtime tests and public type assertions.
A rejected row also checks that the type error and the runtime error give the same reason, so give each new error path a row.

The package's `test:types-perf` script checks both phrase literals and typed schedule objects.
Run `pnpm turbo run test:types-perf --filter @sanely/cron` to build workspace dependencies before the check.
Run this check separately from builds and tests, because concurrent work can exceed its time budget.
`build:verify` checks the packed runtime and declarations. `test:compat` loads built exports, and CI runs it on the package's Node.js floor.

See the root [contributor guide](../../../CONTRIBUTING.md#run-the-checks) for commands and the [shared test placement rules](../../../docs/agents/package-structure.md#tests-and-benchmarks).
