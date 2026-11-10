<div align="center">
  <h1 align="center">🎐 <code>sanely</code></h1>

  <p align="center">
    <strong>TypeScript libraries with sane defaults</strong>
  </p>
</div>

Sanely is a pnpm and Turborepo monorepo for the `@sanely/*` libraries. Each package starts from the [keel](https://github.com/adelrodriguez/keel) library template, with tsdown, vitest, and Changesets. Adamantite and Packref are set up at the root.

Read [CONTRIBUTING.md](CONTRIBUTING.md) for workspace changes and releases, and [CODING_STANDARDS.md](CODING_STANDARDS.md) for decisions that need human review.

## Packages

Migrated packages contain their source libraries. The other packages still contain the starter.

| Package                                   | What it does                                                                                                                   | Replaces                                                  | Status   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | -------- |
| [`@sanely/try`](packages/try)             | A better try/catch for TypeScript.                                                                                             | [`tryharder`](https://github.com/adelrodriguez/tryharder) | Migrated |
| [`@sanely/errors`](packages/errors)       | Extensible error handling for TypeScript.                                                                                      | [`faultier`](https://github.com/adelrodriguez/faultier)   | Migrated |
| [`@sanely/ratelimit`](packages/ratelimit) | Atomic rate limiting with pluggable stores.                                                                                    | [`richter`](https://github.com/adelrodriguez/richter)     | Migrated |
| [`@sanely/flags`](packages/flags)         | Type-safe feature flag library for TypeScript applications.                                                                    | [`gated`](https://github.com/adelrodriguez/gated)         | Migrated |
| [`@sanely/duration`](packages/duration)   | Parse human-readable time expressions into any unit, and format durations into human-readable strings.                         | [`humanspan`](https://github.com/adelrodriguez/humanspan) | Migrated |
| [`@sanely/cron`](packages/cron)           | A small, type-safe English-like language that compiles to exact cron expressions.                                              | None                                                      | Migrated |
| [`@sanely/rpc`](packages/rpc)             | Type-safe RPC from a Standard Schema contract, over any transport: Electron IPC, workers, WebSockets, HTTP, or message queues. | [`typedport`](https://github.com/adelrodriguez/typedport) | Migrated |
| [`@sanely/skew`](packages/skew)           | Keep your deployments fresh.                                                                                                   | [`crispen`](https://github.com/adelrodriguez/crispen)     | Migrated |
| [`@sanely/request`](packages/request)     | Read the client IP address and location from a request.                                                                        | None                                                      | Migrated |

The private [`@sanely/core`](packages/core) workspace holds shared definitions.
Libraries can reuse internal workspaces without adding third-party runtime dependencies.
Cron, duration, ratelimit, and skew bundle core's JavaScript and types, so consumers install each library on its own.

## Add a package

1. Run `pnpm run generate new-package`. It asks for the name, emoji, and description, then creates `packages/<name>` from the starter and installs dependencies. To skip the prompts, pass the answers in order, such as `pnpm run generate new-package --args cache 🗄️ "A small cache"`.
2. Replace the example in `src/` with the library.
3. Add the package to the table above.
4. When the package is ready to publish, remove `private` from its `package.json` without a changeset.
5. Publish version `0.0.1` once by hand. npm accepts a trusted publisher only for a package that exists. Run `npm login`, build the package, and run `pnpm publish --access public` in `packages/<name>`.
6. Make `release.yml` the trusted publisher with `npm trust github @sanely/<name> --file release.yml --repo adelrodriguez/sanely --allow-publish`. This needs npm 11.15.0 or later and 2FA on your npm account. After that, `release.yml` publishes each new version.

## Layout

- Package source entry points correspond to the exports in `package.json`. See the [package structure reference](docs/agents/package-structure.md) for source and test ownership.
- `src/lib/` holds the library logic. Oxlint checks its declared dependency direction with `no-restricted-imports`.
- Code imports with `#` subpath imports, such as `#lib/shared/errors.ts`.
- Tests sit in a `__tests__/` folder beside the file they test, with the same name. `src/__tests__/types.test-d.ts` tests the public types with `expectTypeOf`.
- `scripts/` holds the build checks that every package shares, and `setup-repo.sh`, which creates or updates the `main` ruleset on GitHub.
- `turbo/generators/` holds the `new-package` generator. Its templates are the starter for every package.
- `tooling/tsconfig/` holds the TypeScript configurations. Each package's `tsconfig.json` extends `@tooling/tsconfig/library.json`, and the root `tsconfig.json` extends `@tooling/tsconfig/base.json`.

## Scripts

Run these from the root. Turborepo runs the package tasks and caches their results. Run `pnpm run build` before `pnpm run check`, because type-aware lint reads the built types of a workspace dependency.

| Script                  | What it does                                                         |
| ----------------------- | -------------------------------------------------------------------- |
| `pnpm run check`        | Formatting, lint, and types, including `types.test-d.ts`             |
| `pnpm run fix`          | Formatting and safe lint fixes                                       |
| `pnpm run analyze`      | Package consistency, and unused files, exports, and dependencies     |
| `pnpm run build`        | Builds every package                                                 |
| `pnpm run dev`          | Rebuilds every package when its source changes                       |
| `pnpm run test`         | Unit tests                                                           |
| `pnpm run test:compat`  | Runs each built package with the globals of the `engines.node` floor |
| `pnpm run build:verify` | Builds, packs, installs, and type-checks each package as a consumer  |
| `pnpm run generate`     | Runs a Turborepo generator, such as `new-package`                    |
| `pnpm run bump:deps`    | Updates dependencies in every workspace, with a prompt               |

## CI

| Workflow         | Jobs                                                                 |
| ---------------- | -------------------------------------------------------------------- |
| `adamantite.yml` | `check`, `analyze`                                                   |
| `test.yml`       | `unit`, `types-perf`, `compat`                                       |
| `build.yml`      | `build`                                                              |
| `release.yml`    | Waits for the jobs above, then versions or publishes with Changesets |
| `pullfrog.yml`   | Pullfrog review agent                                                |
