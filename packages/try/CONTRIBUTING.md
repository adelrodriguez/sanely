# Contributing to `@sanely/try`

The package lives in `packages/try` of the [sanely](https://github.com/adelrodriguez/sanely) monorepo. It uses pnpm and the Node.js version in the root `.node-version` (24).

## Set up

Clone the repository and install the dependencies at the repository root:

```bash
git clone https://github.com/adelrodriguez/sanely.git
cd sanely
pnpm install
```

Use the pnpm version that the root `package.json` pins. pnpm 12 writes two YAML documents in
`pnpm-lock.yaml`: one for the package manager and one for project dependencies.
Keep both documents. Older pnpm versions can reject this format.

## Know the layout

Read the [architecture](docs/architecture.md) for source ownership and dependencies.
Read the [testing guide](docs/testing.md) for test placement and package checks.

## Run the checks

Run the package commands in `packages/try`, and the workspace commands from any folder. CI runs the same checks.

| Command                             | What it does                                                                        |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| `pnpm --workspace-root run check`   | Check formatting, lint, and types, including `src/__tests__/types.test-d.ts`.       |
| `pnpm --workspace-root run fix`     | Apply safe lint fixes and format all files. Run it after you edit files.            |
| `pnpm --workspace-root run analyze` | Find unused files, exports, and dependencies. Run it after you change dependencies. |
| `pnpm run test`                     | Run the unit tests.                                                                 |
| `pnpm run test:watch`               | Run the unit tests in watch mode.                                                   |
| `pnpm run test:coverage`            | Run the unit tests with coverage.                                                   |
| `pnpm run build`                    | Build the package into `dist/`.                                                     |
| `pnpm run dev`                      | Build the package in watch mode.                                                    |
| `pnpm run build:verify`             | Pack and install the built package, then check its entry points and declarations.   |
| `pnpm run test:compat`              | Run the built package on the minimum supported runtime.                             |

CI runs `test:compat` on the exact `engines.node` floor, Node.js 22.0.0.

Before you open a pull request, run `pnpm --workspace-root run check`, `pnpm run test`, and `pnpm run build:verify`.

## Run the benchmarks

```bash
# Print a comparison table for each benchmark group
pnpm run bench

# Also write bench-results/vitest.json, latest.json, and summary.md
pnpm run bench:ci
```

Benchmarks track relative performance trends. They are not a required PR gate, because microbenchmarks are noisy. The `try-benchmarks` workflow runs `bench:ci` every Monday and publishes the summary.

Each public API has a `*.bench.ts` file next to its tests in `src/__tests__/`. Each `test()` in that file is one benchmark group. It uses the `bench` fixture and `bench.compare()`, so Vitest interleaves the cases in a group and prints one table for the group. Give every `bench()` a unique name across the suite.

Follow these rules when you write a benchmark:

- Import from the typed `src` entrypoint, so `check` does not depend on a prior `build`. Vite's module runner adds a small getter overhead to each import. The overhead is constant across runs, so trends stay valid.
- Keep cases deterministic and timer-free. Do not use `sleep`, real timeout expiry, or cancellation races.
- Set up task graphs and builders outside the measured function.
- Pass each result to `consume()` from `test-utils.ts`, so the runtime cannot optimize the work away.
- When you change cases or tooling so that old results are no longer comparable, increment `BENCHMARK_SUITE_VERSION` in `scripts/bench-report.ts`.

Read the results like this:

- Treat the suite as an overhead tracker, not as an end-to-end latency test. Compare like-for-like cases over time. The most useful regressions are usually `run/function/sync-success`, `runSync/function/success`, `run/object/mapped-error`, `all/two-independent-sync-tasks`, `allSettled/two-successful-tasks`, and `flow/immediate-exit`.
- Prefer absolute changes in ns/iter. A +200 ns regression on a hot path means more than a percentage without context.
- Use the direct baselines for scale only. Vitest times each iteration, which adds tens of nanoseconds. Cases under about 1 µs read higher than their real cost.
- Read policy cases (`builder/sync`, `builder/async`) as the incremental cost of a policy that does not fire. The async cases are the ones to watch when you change `resolveWithAbort()`.
- Read orchestration cases (`all`, `allSettled`, `flow`) as fixed framework cost for very small graphs. They are expected to be much slower than `Promise.all`. Compare the `-with-signal`, `-with-disposer`, and dependency cases with the plain cases to see where the setup cost goes.
- Only compare runs that use the same Node.js version (see `.node-version`), machine class, and suite version.

## Follow the code style

- Use the vocabulary defined in [GLOSSARY.md](GLOSSARY.md) when naming things in code, tests, issues, and docs
- Follow the existing TypeScript style in the repository
- Prefer type inference when it already produces the correct type
- Avoid explicit return types unless required for tooling or public API contracts
- Keep implementation straightforward and local; prefer obvious duplication over premature abstraction while behavior is still evolving
- Use meaningful names and keep public APIs well documented through readable code and tests
- Avoid `any` unless there is a strong justification

## Write tests

Follow the [testing guide](docs/testing.md).

## Add a changeset

Add a changeset when your change affects package users. See the Changesets section of the root [`AGENTS.md`](../../AGENTS.md).

## Report a problem

Open an issue at [adelrodriguez/sanely](https://github.com/adelrodriguez/sanely/issues). Search the open issues first, and include a minimal reproduction.

## License

The package uses the MIT license. See [LICENSE](../../LICENSE).
