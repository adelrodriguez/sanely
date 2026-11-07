# Testing

Module suites live in adjacent `__tests__/` folders and match the source file names.
Public contract suites and type assertions live in `src/__tests__/`.
The workspace `check` command checks type assertions; Vitest runs the runtime suites.

Property tests cover duration conversions and formatting round trips.
Parsing suites cover every shared unit alias and the strict and lenient forms.
Core tests conversion values and alias ownership; duration tests how its public operations use those definitions.

`build:verify` installs the packed runtime and declarations in an isolated consumer.
`test:compat` loads the built exports, and CI runs it on the package's Node.js floor.

See the root [contributor guide](../../../CONTRIBUTING.md#run-the-checks) for commands and the [shared test placement rules](../../../docs/agents/package-structure.md#tests-and-benchmarks).
