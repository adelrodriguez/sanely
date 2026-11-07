# Package structure

Each package is one context. Its public source entry points correspond to the exports in its `package.json`.
Private implementation belongs in `src/lib/`.

## Source ownership

Use domain folders when the implementation has separate owners, such as execution, policies, and orchestration.
A package with one coherent domain can keep `lib/` flat, as `@sanely/errors` does.
Keep files in one domain together. A package must not mix flat implementation files with domain folders in `lib/`.

Use `index.ts` for a folder's main module. For example, use `#lib/factory/index.ts` instead of `#lib/factory/factory.ts`.
Give supporting modules specific names. A folder needs no barrel file unless that file has a caller.
An integration can have an `index.tsx` main module when it contains JSX.

Use `./` for imports within a folder and full `#` paths for imports across folders.
The `project/source-imports` rule applies this convention to imports, re-exports, and literal dynamic imports.
Its safe fix resolves the source file before it changes the path.
Implementation modules must not import their own package's source entry points.
Declare permitted domain dependencies in the Oxlint configuration that applies to the package, including type imports.
Update those declarations when you add a package or domain.
For code shared across packages, follow [Share internal code](../../CONTRIBUTING.md#share-internal-code).

## Tests and benchmarks

A module's tests belong in the adjacent `__tests__/<file>.test.ts` or `.test.tsx` file.
For example, `lib/factory/index.ts` has `lib/factory/__tests__/index.test.ts`.
Module benchmarks use the same location and a `.bench.ts` suffix.
Shared fixtures and test data use plain files in the nearest common `__tests__/` folder.

Public contract suites and public type tests belong in `src/__tests__/`.
These suites can test behavior across several modules and use descriptive names.
Call the subject through a public source entry point. Fixtures can use internal types and test data.
Tests for package scripts belong in `scripts/__tests__/`.
Checks of an installed package can keep consumer fixtures outside `src/`.

The `project/package-structure` lint rule checks source ownership, main-module names, and module-test locations.
The rule's fixtures run through the root `test:rules` script and are part of the root test command.

## Documentation

Keep package source ownership in `docs/architecture.md` and package test requirements in `docs/testing.md`.
Link to these pages from contributor guidance. See [coding standards](../../CODING_STANDARDS.md) for glossary content.

The README introduces the package and links to consumer documentation.
Use `docs/reference.md` for an API reference or an index of larger reference pages.
Put task guides in `docs/how-to/` and design explanations in `docs/explanation/`.
Add a documentation category only when it has content.

## Check a structural change

- Confirm that public import paths and behavior stay compatible.
- Move a source file and its module tests together.
- Run the affected package tests and workspace checks before the next move.
- Keep a replayable script for a migration across many files.
- Run `analyze` after import or export changes, then verify the built package and its declarations.
