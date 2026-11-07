# Contributing to `@sanely/flags`

The package lives in `packages/flags` of the [sanely](https://github.com/adelrodriguez/sanely) monorepo.

## Requirements

- [Node.js](https://nodejs.org): the version in the root `.node-version` (24).
- [pnpm](https://pnpm.io): the version that the root `package.json` pins (12).
- [Git](https://git-scm.com).

## Set up the repository

1. Clone the repository:

   ```sh
   git clone https://github.com/adelrodriguez/sanely.git
   cd sanely
   ```

2. Install dependencies at the repository root:

   ```sh
   pnpm install
   ```

3. Create a branch for the change.

Read [GLOSSARY.md](GLOSSARY.md) before you change behavior or terminology. Use the project's domain language.

## Layout

Read the [architecture](docs/architecture.md) for source ownership and dependencies.
Read the [testing guide](docs/testing.md) for test placement and package checks.

## Development commands

Run the package commands in `packages/flags`, and the workspace commands from any folder.

```sh
pnpm run build          # Build the published package into dist.
pnpm run build:verify   # Test the packed package. Run build first.
pnpm run dev            # Rebuild when source files change.
pnpm run test           # Run the Vitest suite and enforce coverage thresholds.
pnpm run test:watch     # Run tests when files change.
pnpm run test:coverage  # Run tests and collect coverage.
pnpm run test:compat    # Load the built package with the engines.node globals.
pnpm --workspace-root run check    # Check formatting, lint rules, and TypeScript types.
pnpm --workspace-root run fix      # Apply formatting and safe lint fixes.
pnpm --workspace-root run analyze  # Find unused files, exports, and dependencies.
```

`check`, `fix`, and `analyze` use Adamantite. There is no separate `typecheck`
script.

## Make a change

- Follow the [architecture](docs/architecture.md) when you change source ownership.
- Follow the [testing guide](docs/testing.md) when you change tests.
- Public API type changes require coverage in `src/__tests__/types.test-d.ts`.
- Write type assertions with `expectTypeOf` from `vitest`.
- Type assertions are checked by `pnpm --workspace-root run check`, not Vitest.
- Update user documentation when public behavior, types, or entry points change.
- Consider package consumers before you change `@sanely/flags`, `@sanely/flags/hooks`, or
  `@sanely/flags/react`.

## Validate a change

Run the full repository workflow before you open a pull request:

```sh
pnpm run test
pnpm run build:verify
pnpm --workspace-root run check
pnpm --workspace-root run fix
```

Run `pnpm --workspace-root run analyze` after you add or remove dependencies or change imports and exports.
Review all automatic fixes before you commit them.

## Changesets

Add a changeset for a change that affects users of the published package. Examples include
public API changes, bug fixes, runtime dependency changes, and documentation shipped with
the package.

```sh
pnpm exec changeset
```

Commit the generated `.changeset/*.md` file with the pull request. Do not add a changeset
for tests, CI, contributor documentation, release tooling, or other internal maintenance.
Do not create a major changeset unless the breaking change is intentional and approved.

## Pull requests

In the pull request description, explain:

- What changed.
- Why the change is needed.
- How you validated the change.
- Whether the change affects public behavior or requires migration.

All CI checks must pass before merge. Link related GitHub issues.

## Security

Do not report vulnerabilities in public issues. Follow [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions are licensed under the [MIT License](../../LICENSE).
