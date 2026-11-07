# Glossary map

## Contexts

Each package is its own context. A package gets its glossary at `packages/<name>/GLOSSARY.md` when the project resolves its terms. No package has a glossary yet.

- `@sanely/try`: runs code that can fail, with retries, timeouts, and cancellation
- `@sanely/errors`: defines and handles tagged errors
- `@sanely/ratelimit`: limits the rate of requests with atomic stores such as Redis
- `@sanely/flags`: evaluates type-safe feature flags
- `@sanely/duration`: parses and formats human-readable durations
- `@sanely/cron`: compiles an English-like schedule language to cron expressions
- `@sanely/rpc`: calls procedures from a Standard Schema contract over any transport
- `@sanely/skew`: detects stale clients after a deployment

## Relationships

The packages do not depend on each other. A term means what the glossary of its package says, even when another package uses the same word.
