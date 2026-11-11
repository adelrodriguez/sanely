# Architecture

- `src/lib` holds one folder per domain. Dependencies point one way: `options` and `expiring-map` ← `algorithms` ← `store` (the contract) ← `transitions` ← `stores/*`, and `store` ← `limiter`. `oxlint.config.ts` at the repository root enforces this for every source file, at every depth. A new folder in `src/lib` may import nothing else in lib until it has a rule there and a place in this list.
- A folder imports its own files with `./`, and other folders with `#lib/...`.
- Millisecond conversion constants come from `@sanely/core/time`. The build bundles them, so the published package has no dependency on core.
- `#lib/options` reads a window, an interval, or a timeout given as a time expression with `@sanely/duration`. It is a runtime dependency, so a consumer that also imports duration shares one copy. The build keeps it external, and `build:verify` installs it from its own tarball.
- A new store goes in `src/lib/stores/<name>/`, with its public entry in `src/stores/<name>.ts` and a `./stores/<name>` export in `package.json`. The build makes an entry from every file in `src/stores/`, and `pnpm run build:verify` fails when one has no export. The lint rules already cover it.
- `src/lib/transitions/` holds the arithmetic of every algorithm in JavaScript. The memory store applies an algorithm with `transition` and writes the state it returns. `stateStore` in `state-store.ts` does the same for a store that a user builds on a database transaction, and parses the saved value first, because a database row is external input. The Redis scripts match the arithmetic line for line.
- An error class lives with the code that throws it.
- The Redis scripts are plain `.lua` files. `scripts.macro.ts` inlines them into the bundle at build time through `unplugin-macros`, so the package never reads files at run time.
- `src/lib/stores/redis/` holds one store per client: `redis-store.ts` (ioredis and node-redis), `valkey-store.ts` (iovalkey), and `bun-redis-store.ts` (`Bun.RedisClient`). Each takes the client as it is and adapts it to `scriptStore` in `script-store.ts`, which runs the scripts. A new client for these servers gets its own store here.
