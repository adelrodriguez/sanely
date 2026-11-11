# `@tooling/tsconfig`

Shared TypeScript configurations.

- `base.json` holds the compiler options for every workspace. It extends `adamantite/typescript`.
- `library.json` covers a package in `packages/`: its `src/` and `scripts/` folders and its config files. It adds the DOM library. A package's `tsconfig.json` extends it and sets an option only when that package needs it, such as `exactOptionalPropertyTypes` in `@sanely/cron`.
