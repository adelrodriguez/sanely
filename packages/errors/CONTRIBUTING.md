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

```text
src/
├── index.ts          # The @sanely/errors entry point
├── errors.ts         # The @sanely/errors/errors entry point
├── types.ts          # The @sanely/errors/types entry point
├── __tests__/        # Tests of the public entry points and types
└── lib/              # The implementation
    ├── __tests__/    # Unit tests of the files in lib/
    ├── errors.ts     # The error classes of the package
    ├── fault.ts      # Fault, isFault, findCause, and serialization
    ├── match.ts      # Tag matching
    ├── registry.ts   # registry and merge
    ├── reviver.ts    # Wire format validation and deserialization
    ├── tagged.ts     # Tagged
    └── wire.ts       # The wire format types, reserved keys, and payload fields
```

[`GLOSSARY.md`](GLOSSARY.md) defines the terms of the package and its behavior.

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

- A `__tests__/` folder tests only the files in its parent folder.
- Public tests live in `src/__tests__/`, and import only from `src/index.ts`, `src/errors.ts`, or `src/types.ts`.
- Unit tests for `src/lib/` live in `src/lib/__tests__/`, and import only from `src/lib/`.
- A change to a public type needs a type test in `src/__tests__/types.test-d.ts`. Write it with `expectTypeOf` from `vitest`. `pnpm --workspace-root run check` runs the type tests, and Vitest does not.

## Add a changeset

Add a changeset when your change affects package users. See the Changesets section of the root [`AGENTS.md`](../../AGENTS.md).

## Report a problem

Open an issue at [adelrodriguez/sanely](https://github.com/adelrodriguez/sanely/issues). Search the open issues first.

## License

The package uses the MIT license. See [LICENSE](../../LICENSE).
