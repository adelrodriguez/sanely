<div align="center">
  <h1 align="center">🎐 <code>sanely</code></h1>

  <p align="center">
    <strong>TypeScript libraries with sane defaults</strong>
  </p>
</div>

Sanely is a pnpm and Turborepo monorepo for the `@sanely/*` libraries. Each package starts from the [keel](https://github.com/adelrodriguez/keel) library template, with tsdown, vitest, and Changesets. Adamantite and Packref are set up at the root.

## Packages

Migrated packages contain their source libraries. The other packages still contain the starter.

| Package                                   | Replaces                                                  | Status   |
| ----------------------------------------- | --------------------------------------------------------- | -------- |
| [`@sanely/try`](packages/try)             | [`tryharder`](https://github.com/adelrodriguez/tryharder) | Starter  |
| [`@sanely/errors`](packages/errors)       | [`faultier`](https://github.com/adelrodriguez/faultier)   | Starter  |
| [`@sanely/ratelimit`](packages/ratelimit) | [`richter`](https://github.com/adelrodriguez/richter)     | Starter  |
| [`@sanely/flags`](packages/flags)         | [`gated`](https://github.com/adelrodriguez/gated)         | Starter  |
| [`@sanely/duration`](packages/duration)   | [`humanspan`](https://github.com/adelrodriguez/humanspan) | Starter  |
| [`@sanely/cron`](packages/cron)           | [`plaincron`](https://github.com/adelrodriguez/plaincron) | Migrated |
| [`@sanely/rpc`](packages/rpc)             | [`typedport`](https://github.com/adelrodriguez/typedport) | Starter  |
| [`@sanely/skew`](packages/skew)           | [`crispen`](https://github.com/adelrodriguez/crispen)     | Starter  |

## Add a package

1. Run `pnpm run generate new-package`. It asks for the name, emoji, and description, then creates `packages/<name>` from the starter and installs dependencies. To skip the prompts, pass the answers in order, such as `pnpm run generate new-package --args cache 🗄️ "A small cache"`.
2. Replace the example in `src/` with the library.
3. Add the package to the table above.
4. When the package is ready to publish, remove `private` from its `package.json` without a changeset, and add it as a trusted publisher on npm for this repository's `release.yml` workflow. After the merge, `release.yml` publishes version `0.0.1`.

## Layout

- `packages/<name>/src/index.ts` exports the public API of a package. Everything else stays internal.
- `src/lib/` holds the library logic in folders whose imports point one way. `oxlint.config.ts` enforces the direction with `no-restricted-imports`.
- Code imports with `#` subpath imports, such as `#lib/shared/errors.ts`.
- Tests sit in a `__tests__/` folder beside the file they test, with the same name. `src/__tests__/types.test-d.ts` tests the public types with `expectTypeOf`.
- `scripts/` holds the build checks that every package shares.
- `turbo/generators/` holds the `new-package` generator. Its templates are the starter for every package.
- `tooling/tsconfig/` holds the TypeScript configurations. Each package's `tsconfig.json` extends `@tooling/tsconfig/library.json`, and the root `tsconfig.json` extends `@tooling/tsconfig/base.json`.

## Scripts

Run these from the root. Turborepo runs the package tasks and caches their results.

| Script                  | What it does                                                         |
| ----------------------- | -------------------------------------------------------------------- |
| `pnpm run check`        | Formatting, lint, and types, including `types.test-d.ts`             |
| `pnpm run fix`          | Formatting and safe lint fixes                                       |
| `pnpm run analyze`      | Package consistency, and unused files, exports, and dependencies     |
| `pnpm run build`        | Builds every package                                                 |
| `pnpm run test`         | Unit tests                                                           |
| `pnpm run test:compat`  | Runs each built package with the globals of the `engines.node` floor |
| `pnpm run build:verify` | Builds, packs, installs, and type-checks each package as a consumer  |
| `pnpm run generate`     | Runs a Turborepo generator, such as `new-package`                    |

## CI

| Workflow         | Jobs                                                                 |
| ---------------- | -------------------------------------------------------------------- |
| `adamantite.yml` | `check`, `analyze`                                                   |
| `test.yml`       | `unit`, `compat`                                                     |
| `build.yml`      | `build`                                                              |
| `release.yml`    | Waits for the jobs above, then versions or publishes with Changesets |
| `pullfrog.yml`   | Pullfrog review agent                                                |
