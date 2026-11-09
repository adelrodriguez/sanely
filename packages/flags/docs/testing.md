# Testing

Public contract suites live in `src/__tests__/` and call the public source entry points.
The core, batch, and lifecycle suites stay separate. Public type assertions live in `types.test-d.tsx`.
The workspace `check` command checks type assertions. Vitest does not run them.

Direct module suites match their source files in adjacent `__tests__/` folders.
Decision construction and validation tests live beside `lib/definition/decision.ts`.
React tests live beside `integrations/react/index.tsx` and use the existing DOM test environment.
They include server rendering with a snapshot and hydration on the client.

The package test command collects coverage and enforces the existing per-file thresholds.
Functions, lines, and statements each require 90 percent coverage.

`build:verify` installs the packed core without React and evaluates flags through the core and testing entry points.
It then installs React, checks the React exports and client directive, and type-checks a consumer file against the published declarations.
It also checks that the built entry points share one `anonymous` symbol.
`test:compat` loads built exports with the compatibility script. CI runs it on the package's Node.js floor.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for commands and the [shared test placement rules](../../../docs/agents/package-structure.md#tests-and-benchmarks).
