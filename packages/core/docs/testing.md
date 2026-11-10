# Testing

Core's own suites check the unit table. The libraries that use core check its definitions again through their public APIs.

## Core suites

Core has two suites:

- `src/lib/time/__tests__/table.test.ts` checks conversion values, alias lookups in any casing, the rejection of unknown aliases and names, that each alias belongs to one unit, and the largest-to-smallest order that duration's `format` relies on.
- `src/__tests__/types.test-d.ts` checks that each unit lists its `long`, `longPlural`, and `short` spellings among its aliases. Duration's `format` writes those spellings, so this check keeps its output parseable. `pnpm run check` enforces this suite, and Vitest never runs it.

## Library suites

These library suites also cover core's definitions:

- Duration's public type suite checks the shared alias types through duration's exports.
- Cron's public type suite checks the interval and time types that cron derives from the clock ratios.
- The parsing, formatting, and error suites of cron and duration run against core through each library's public API.

## Build checks

Core's `build:verify` script packs core, installs it in an isolated consumer, loads `@sanely/core/time`, and type-checks the consumer against its declarations.

Each library's `build:verify` script also loads its built entry points and type-checks a consumer against its declarations.
Cron, duration, and ratelimit first pack the library and install it in an isolated consumer.

Core's `test:compat` script loads core's built entry point.
CI runs it on the Node.js version in core's `engines.node` field.

See [Run the checks](../../../CONTRIBUTING.md#run-the-checks) for the commands.
