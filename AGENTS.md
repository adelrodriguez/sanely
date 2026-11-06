# AGENTS.md

Use ASD-STE100 Simplified Technical English for all communication.

Before you explore or change code, read the relevant `GLOSSARY.md` files. Use the
ubiquitous language in these files.

## Workspace

- Each package lives in `packages/<name>` and publishes as `@sanely/<name>`.
- Run `pnpm run generate new-package` to add a package. The Turborepo generator renders the
  starter in `turbo/generators/templates/scaffolds/new-package/`, which has the same example as
  the keel template. Replace the example in `src/` with the library. To change what every new
  package starts with, edit those templates.
- Every package starts at version `0.0.1` and is private, so Changesets does not publish it.
  When the package is ready to publish, remove `private` from its `package.json` without a
  changeset. After the merge, `release.yml` publishes `0.0.1`.
- Turborepo runs `build`, `test`, `test:compat`, and `build:verify` in each package and caches
  the results. Run them from the root, such as `pnpm run test`, or for one package with
  `pnpm turbo run test --filter @sanely/try`.
- Adamantite runs once over the whole repository. Put rules for one package in an
  `overrides` entry in `oxlint.config.ts` with a `packages/<name>/` glob.
- A package's `tsconfig.json` only extends `@tooling/tsconfig/library.json`. Change compiler
  options in `tooling/tsconfig/`, not in a package.
- Packages share tool versions through the catalog in `pnpm-workspace.yaml`. Use `catalog:` for
  a tool that every package uses.

## Agent skills

### Issue tracker

Issues and PRDs are tracked as GitHub issues at `adelrodriguez/sanely`. See
`docs/agents/issue-tracker.md`.

### Triage labels

Use the default five-role triage vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

Use the single-context domain-doc layout. See `docs/agents/domain.md`.

## Changesets

- Use Changesets for versioning and changelog management.
- Run `pnpm exec changeset --empty` to create an empty changeset.
- Do not make a major version bump unless the user requests it.
- If a change is breaking and the package is at version 1.0.0 or higher, alert the user.

<!-- ADAMANTITE:START -->

## Adamantite

This project uses Adamantite for its managed formatting, linting, type checking, and dependency-analysis setup.

- Prefer the package scripts Adamantite added for this workspace.
- Run `pnpm run check` to catch formatting, lint, and type issues. Direct command: `adamantite check`.
- Run `pnpm run fix` to apply safe lint fixes and format code. Direct command: `adamantite fix`.
- Run `pnpm run analyze` after changing dependencies, imports, or exports. It also checks monorepo package consistency. Direct command: `adamantite analyze`.
- Write project-specific lint rules in `.adamantite/rules/`, one rule for each file. Run `adamantite rule add <name>` to start a rule with its authoring guidance.
- Run `adamantite doctor` and follow its findings to repair managed setup.

<!-- ADAMANTITE:END -->

<!-- PACKREF:START -->

## Packref

Use Packref when you need to inspect a dependency's exact source implementation or compare referenced versions; read the local `packref` skill, or install it with `npx -y skills add https://github.com/adelrodriguez/packref/tree/v0.3.7 --skill packref --yes`.
Run `remove`, `prune`, `clean`, or `clean --global` only when the user requests that removal scope, because these commands delete state.
<!-- PACKREF:END -->
