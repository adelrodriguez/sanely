# How to contribute

This guide covers workspace configuration, checks, and releases.
Use the package's contributor guide for its runtime behavior and tests.

## Add or change a package

1. Follow [Add a package](README.md#add-a-package) to generate a package and replace its starter example.
2. Follow the [package structure reference](docs/agents/package-structure.md) when you change source or test ownership.
3. To change what every new package starts with, edit `turbo/generators/templates/scaffolds/new-package/`.

The generator uses the same starter as the keel template.
Each library lives in `packages/<name>` and publishes as `@sanely/<name>`.
Libraries bundle the shared `@sanely/core` package instead of depending on it.

## Share internal code

Put definitions used by more than one library in `packages/core`, under the domain that owns them.
Export each domain through a named subpath, such as `@sanely/core/time`.
Core does not import a library package or use third-party runtime dependencies.

To use core in a library:

1. Add `@sanely/core` to the library's `devDependencies` with `workspace:*`.
2. Import an exported domain subpath and add it to the package's allowed imports in `oxlint.config.ts`.
3. Add the imported core subpaths, such as `@sanely/core/time`, to `deps.alwaysBundle` in its tsdown configuration.
4. Set `deps.onlyBundle` and `deps.onlyImport` to `[]` to reject bundled third-party packages and external package imports, including declarations.
5. Run `build:verify` to check the packed library in an isolated consumer.

Turborepo builds core before its consumers, including when starting development watchers.
Published libraries contain the shared implementation and declarations.
They do not declare core as a runtime dependency, so each library installs without core and keeps the core version it was built with.
See the [core architecture](packages/core/docs/architecture.md) for ownership and dependency boundaries.

## Change workspace configuration

- To change compiler options, edit the [shared TypeScript configurations](tooling/tsconfig/README.md). A package's `tsconfig.json` only extends `@tooling/tsconfig/library.json`.
- To change a tool version shared by packages, edit the catalog in `pnpm-workspace.yaml`. Use `catalog:` in each package that uses the shared version.
- To add package-specific build or compatibility checks, put them in `packages/<name>/scripts/` and select them with `build:verify` or `test:compat`.
- To add a package-level Oxlint configuration, explicitly extend the shared rules. Keep `options.typeAware` and `options.typeCheck` in the root configuration.

## Run the checks

Use the [root scripts](README.md#scripts) and [tooling guidance](docs/agents/tooling.md).
Build workspace dependencies before `check`, because type-aware lint reads their built declarations.
Run `analyze` after you change dependencies, imports, or exports.

To run a package task through Turborepo, select the package:

```sh
pnpm turbo run test --filter @sanely/try
```

Turborepo caches package builds, tests, build verification, and compatibility checks.
CI runs each package's compatibility script on the Node.js floor in its `engines.node`.

## Prepare a release

1. Add a changeset when a change affects users of a published package. Skip internal refactors, test changes, and documentation cleanup.
2. Create the entry with `pnpm exec changeset --empty`, then describe the change and select its package version bump.
3. Use a major bump only when the user requests it. Alert the user if a breaking change affects a package at version `1.0.0` or higher.

When you change core, add a changeset for each library whose behavior or types change. Once core is published, add one for core too.
A library ships a core change only in a new version of its own, because it bundles core.

For a package's first publication, follow [Add a package](README.md#add-a-package).
New packages start private at `0.0.1`. Remove `private` without a changeset when the package is ready.
The user publishes `0.0.1` and configures the trusted publisher. The release workflow publishes later versions.
