# Testing

Public API suites and benchmarks live in `src/__tests__/` and import the public source entry points.
They cover result unions, policy chains, task graphs, composition, and disposal across domains.

Direct module suites live in adjacent `__tests__/` folders and match their source filenames.
The retry-option normalization and abort-listener cases have separate suites in their owning domains.
The disposal suite lives with `lib/disposal/index.ts`. Repository-script tests stay in `scripts/__tests__/`.

Public type assertions live in `src/__tests__/types.test-d.ts` and use Vitest's `expectTypeOf`.
The workspace `check` command checks these assertions. Vitest does not run them.
Build workspace dependencies before the workspace check.

Use `fast-check` for invariants across many inputs. Keep fixed examples for named cases and exact contracts.
Replay a property failure with its reported `seed` and `path`, then keep its minimized counterexample as a regression case.

`build:verify` checks the installed package, export sets, and strict NodeNext declarations.
`test:compat` checks built behavior with the compatibility script. CI uses the exact Node.js floor.
Preserve the public benchmark cases during source moves so their measurements remain comparable.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for commands and benchmark requirements.
