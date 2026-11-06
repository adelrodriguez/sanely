# `@tooling/tsconfig`

Shared TypeScript configurations.

- `base.json` holds the compiler options for every workspace. It extends `adamantite/typescript`.
- `library.json` covers a package in `packages/`: its `src/` folder and its config files. A package's `tsconfig.json` extends it and needs nothing else.
