# Testing

Each reader has a public contract suite in `src/__tests__/<reader>.test.ts` that calls it through `#index.ts`.
Type assertions for every export live in `src/__tests__/types.test-d.ts`.
The workspace `check` command checks type assertions; Vitest runs the runtime suites.

The `ip` suite runs the same address cases through every place `ip` reads from, so a parsing or classification rule cannot hold in one place and break in another.
Platform cases check both that a platform reads its own headers and that it ignores a forged common header.
The `geo` suite checks each platform's full set of headers, its markers for unknown values, and that it ignores other platforms' headers.

`build:verify` installs the packed runtime and declarations in an isolated consumer.
`test:compat` loads the built exports, and CI runs it on the package's Node.js floor.

See the root [contributor guide](../../../CONTRIBUTING.md#run-the-checks) for commands and the [shared test placement rules](../../../docs/agents/package-structure.md#tests-and-benchmarks).
