# Testing

The unit table suite lives in `src/lib/time/__tests__/table.test.ts`.
It checks conversion values, unknown aliases and names, unique alias ownership, and the size order needed by duration formatting.
The type suite in `src/__tests__/types.test-d.ts` checks that each unit lists its `long`, `longPlural`, and `short` spellings among its aliases, so duration's formatted output stays parseable.
`pnpm run check` enforces the type suite, and Vitest never runs it.

Duration's public type suite checks the shared alias types through its existing exports.
Cron's public type suite checks schedule ranges derived from the shared clock ratios.
Both libraries retain their parsing, formatting, and error contract suites.

Consumer builds reject external package imports in JavaScript and declarations.
Their `build:verify` scripts install packed libraries in isolated consumers and check runtime loading and types.
Core's `test:compat` script loads its built entry point, and CI runs it on the package's Node.js floor.

See the root [contributor guide](../../../CONTRIBUTING.md#run-the-checks) for commands.
