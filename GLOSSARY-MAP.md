# Glossary map

## Contexts

Each package is its own context. A package gets its glossary at `packages/<name>/GLOSSARY.md` when the project resolves its terms.

- [`@sanely/try`](./packages/try/GLOSSARY.md): runs code that can fail, with retries, timeouts, and cancellation
- [`@sanely/errors`](./packages/errors/GLOSSARY.md): defines and handles tagged errors
- [`@sanely/ratelimit`](./packages/ratelimit/GLOSSARY.md): limits the rate of requests with atomic stores such as Redis
- [`@sanely/flags`](./packages/flags/GLOSSARY.md): evaluates type-safe feature flags
- [`@sanely/duration`](./packages/duration/GLOSSARY.md): parses and formats human-readable durations
- [`@sanely/cron`](./packages/cron/GLOSSARY.md): compiles an English-like schedule language to cron expressions
- `@sanely/rpc`: calls procedures from a Standard Schema contract over any transport
- [`@sanely/skew`](./packages/skew/GLOSSARY.md): detects stale clients after a deployment
- [`@sanely/core`](./packages/core/GLOSSARY.md): shared time units and their aliases

## Relationships

Cron and duration share time units and aliases from core. Ratelimit and skew use its millisecond conversion constants. Core depends on none of these packages.
Other terms keep the meaning defined by the glossary of their package.
