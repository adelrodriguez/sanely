# Contributing to Gated

Thank you for contributing to Gated.

## Requirements

- [Node.js](https://nodejs.org) 26.
- [pnpm](https://pnpm.io) 12.
- [Git](https://git-scm.com).

## Set up the repository

1. Fork and clone the repository.
2. Install dependencies:

   ```sh
   pnpm install
   ```

3. Create a branch for the change.

Read [GLOSSARY.md](GLOSSARY.md) before you change behavior or terminology. Use the project's domain language.

## Layout

```text
src/
  index.ts                  Root public API
  factory.ts                Gate factory and batch construction
  decision.ts               Decision helpers
  hooks/                    Hook factory, published as @sanely/flags/hooks
  integrations/react.tsx    React integration, published as @sanely/flags/react
  lib/
    evaluation/             Evaluation engine and batch
      stages/               Hook lifecycle and decision resolution (cache and coalescing)
    config/                 Resolved factory configuration and its decision memory
    gate/                   Gate configuration, decision validation, evaluation keys, registry
    promise-cache/          Promise-cache keys and helpers for integrations
    shared/                 Errors, signals, and other domain-free helpers
    types/                  Type contracts, with no runtime code
  **/__tests__/             Colocated tests
vitest.config.ts            Test and coverage configuration
```

The public package entry points are `@sanely/flags`, `@sanely/flags/hooks`, and `@sanely/flags/react`. `dist/` is build output.

Dependencies go in one direction. A module imports only from its own folder or from a lower
layer:

1. `lib/types/`
2. `lib/shared/`
3. `lib/gate/` and `lib/promise-cache/`
4. `lib/config/`
5. `lib/evaluation/stages/`
6. `lib/evaluation/`
7. `decision.ts`, `factory.ts`, `hooks/`, and `integrations/`
8. `index.ts`

Folders in the same layer do not import each other.

Import a module outside the current folder through a subpath import with its full file path,
for example `#lib/types/index.ts` or `#lib/shared/errors.ts`. The `imports` field in
`package.json` maps `#*` to `src/*`. Use relative imports only inside a folder.
`src/__tests__/architecture.test.ts` enforces the layers, and the workspace lint config rejects
`../` imports.

## Development commands

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

- Keep the gate factory in `src/factory.ts`, the decision helpers in `src/decision.ts`,
  and the core implementation in `src/lib/`.
- Keep hooks in `src/hooks/`.
- Keep the React integration in `src/integrations/react.tsx`.
- Add or update colocated tests for behavior changes.
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

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
