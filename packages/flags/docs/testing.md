# Testing

Public contract suites live in `src/__tests__/` and call the public source entry points.
The core, batch, and lifecycle suites stay separate. Public type assertions live in `types.test-d.ts`.
The workspace `check` command checks type assertions. Vitest does not run them.

Direct module suites match their source files in adjacent `__tests__/` folders.
Factory registration tests live beside `lib/factory/index.ts`.
Decision extraction and validation tests live beside `lib/flag/decision.ts`.
React tests live beside `integrations/react/index.tsx` and use the existing DOM test environment.

The package test command collects coverage and enforces the existing per-file thresholds.
Functions, lines, and statements each require 90 percent coverage.

`build:verify` installs the packed core without React, then checks the React entry with its peer installed.
It checks declarations, the React client directive, and shared evaluator-registry behavior through cache prefetch.
`test:compat` loads built exports with the compatibility script. CI runs it on the package's Node.js floor.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for commands and the [shared test placement rules](../../../docs/agents/package-structure.md#tests-and-benchmarks).
