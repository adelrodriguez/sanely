# How to contribute

This guide covers workspace configuration, checks, and releases.
Use the package's contributor guide for its runtime behavior and tests.

## Add or change a package

1. Follow [Add a package](README.md#add-a-package) to generate a package and replace its starter example.
2. Follow the [package structure reference](docs/agents/package-structure.md) when you change source or test ownership.
3. To change what every new package starts with, edit `turbo/generators/templates/scaffolds/new-package/`.

The generator uses the same starter as the keel template.
Each package lives in `packages/<name>` and publishes as `@sanely/<name>`.

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

For a package's first publication, follow [Add a package](README.md#add-a-package).
New packages start private at `0.0.1`. Remove `private` without a changeset when the package is ready.
The user publishes `0.0.1` and configures the trusted publisher. The release workflow publishes later versions.
