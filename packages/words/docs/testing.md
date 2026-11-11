# Testing

Module suites live in adjacent `__tests__/` folders and match the source file names.
Public contract suites and type assertions live in `src/__tests__/`.
The workspace `check` command checks type assertions. Vitest runs the runtime suites.

`src/lib/names/__tests__/brute-force.ts` enumerates every name of small pools, and provides a seeded source of randomness.
Property tests compare `count`, `shortestFill`, and `generate` with `maxLength` against that enumeration.
The `count` suite also checks default counts against a closed-form formula over the built-in lists.
The generate suite has a timing check for the tightest `maxLength` that fits eight words, which once took over a minute.

`src/__tests__/docs.test.ts` checks the `count` examples in the README, the reference, and the `count` doc comment, and the category sizes in the reference. Update them when you change a list.

`build:verify` installs the packed runtime and declarations in an isolated consumer.
`test:compat` loads the built exports, and CI runs it on the package's Node.js floor.

See the root [contributor guide](../../../CONTRIBUTING.md#run-the-checks) for commands and the [shared test placement rules](../../../docs/agents/package-structure.md#tests-and-benchmarks).
