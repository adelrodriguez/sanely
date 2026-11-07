# Contributing to `@sanely/errors`

The package lives in `packages/errors` of the [sanely](https://github.com/adelrodriguez/sanely) monorepo. It uses pnpm and the Node.js version in the root `.node-version` (24).

## Set up

Clone the repository and install the dependencies at the repository root:

```bash
git clone https://github.com/adelrodriguez/sanely.git
cd sanely
pnpm install
```

## Know the layout

Read the [architecture](docs/architecture.md) for source ownership and dependencies.
Read the [testing guide](docs/testing.md) for test placement and package checks.

## Run the checks

Run the package commands in `packages/errors`, and the workspace commands from any folder. CI runs the same checks.

| Command                             | What it does                                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| `pnpm --workspace-root run check`   | Check formatting, lint, and types, including `src/__tests__/types.test-d.ts`.                      |
| `pnpm --workspace-root run fix`     | Apply safe lint fixes and format all files.                                                        |
| `pnpm --workspace-root run analyze` | Find unused files, exports, and dependencies.                                                      |
| `pnpm run test`                     | Run the unit tests.                                                                                |
| `pnpm run test:watch`               | Run the unit tests in watch mode.                                                                  |
| `pnpm run test:coverage`            | Run the unit tests with coverage.                                                                  |
| `pnpm run build`                    | Build the package into `dist/`.                                                                    |
| `pnpm run dev`                      | Build the package in watch mode.                                                                   |
| `pnpm run build:verify`             | Pack and install the built package, then check its entry points, class identity, and declarations. |
| `pnpm run test:compat`              | Run the built package with the globals of the `engines.node` floor.                                |

## Write tests

Follow the [testing guide](docs/testing.md).

## Add a changeset

Add a changeset when your change affects package users. See the root [release guidance](../../CONTRIBUTING.md#prepare-a-release).

## Report a problem

Open an issue at [adelrodriguez/sanely](https://github.com/adelrodriguez/sanely/issues). Search the open issues first.

## License

The package uses the MIT license. See [LICENSE](../../LICENSE).
