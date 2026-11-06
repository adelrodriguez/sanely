# Contributing to Crispen

Crispen lives in `packages/skew` of the sanely monorepo. It uses pnpm and the Node.js version in the root `.node-version` (24).

## Set up

Run this command at the repository root:

```sh
pnpm install
```

## Run the checks

Run these commands before you open a pull request. CI runs the same commands.

| Command                             | What it does                                               |
| ----------------------------------- | ---------------------------------------------------------- |
| `pnpm --workspace-root run check`   | Check formatting, lint, and types.                         |
| `pnpm --workspace-root run fix`     | Apply safe lint fixes and format all files.                |
| `pnpm run test`                     | Unit tests in `src/`.                                      |
| `pnpm run build`                    | Build the package into `dist/`.                            |
| `pnpm run build:verify`             | Check that the built package exports match `package.json`. |
| `pnpm run test:compat`              | Load the built package with plain Node.js.                 |
| `pnpm --workspace-root run analyze` | Find unused files, exports, and dependencies.              |

## Add a changeset

Add a changeset when your change affects package users. See the Changesets section of the root [`AGENTS.md`](../../AGENTS.md).
