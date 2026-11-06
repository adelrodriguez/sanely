# Glossary Map

## Contexts

Each package is its own context, with its own glossary.

- [`@sanely/try`](./packages/try/GLOSSARY.md): runs code that can fail, with retries, timeouts, and cancellation
- [`@sanely/errors`](./packages/errors/GLOSSARY.md): defines and handles tagged errors
- [`@sanely/ratelimit`](./packages/ratelimit/GLOSSARY.md): limits the rate of requests with atomic stores such as Redis
- [`@sanely/flags`](./packages/flags/GLOSSARY.md): evaluates type-safe feature flags
- [`@sanely/duration`](./packages/duration/GLOSSARY.md): parses and formats human-readable durations
- [`@sanely/cron`](./packages/cron/GLOSSARY.md): compiles an English-like schedule language to cron expressions
- `@sanely/rpc`: calls procedures from a Standard Schema contract over any transport. It has no glossary yet.
- [`@sanely/skew`](./packages/skew/GLOSSARY.md): detects stale clients after a deployment

## Relationships

The packages do not depend on each other. A term means what the glossary of its package says, even when another package uses the same word.
