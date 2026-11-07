# `@sanely/ratelimit` reference

The package has five entry points:

- `@sanely/ratelimit`: algorithms, limiters, results, headers, errors, and the store contract.
- `@sanely/ratelimit/stores/memory`: the memory store.
- `@sanely/ratelimit/stores/redis`: the store for ioredis and node-redis.
- `@sanely/ratelimit/stores/valkey`: the store for iovalkey.
- `@sanely/ratelimit/stores/bun-redis`: the store for `Bun.RedisClient`.

## Algorithms

Every duration is a whole number of milliseconds, up to 2^50 ms (about 35,000 years). Every count is a positive safe integer. An invalid value throws `InvalidOptionError`.

### `fixedWindow({ limit, window })`

```typescript
function fixedWindow(options: WindowOptions): FixedWindow
```

Allows `limit` units in each window. Windows start at multiples of `window` since the epoch, so a window of one day starts at midnight UTC.

```typescript
import { fixedWindow } from "@sanely/ratelimit"

fixedWindow({ limit: 2_000, window: 86_400_000 }) // At most 2,000 units per day.
```

### `slidingWindow({ limit, window })`

```typescript
function slidingWindow(options: WindowOptions): SlidingWindow
```

Allows `limit` units in any period of `window`. The count is the current window's count plus the previous window's count, weighted by how much of the previous window the last full window length still covers.

```typescript
import { slidingWindow } from "@sanely/ratelimit"

slidingWindow({ limit: 30, window: 3_600_000 }) // At most 30 units in any hour.
```

### `tokenBucket({ refillRate, interval, capacity })`

```typescript
function tokenBucket(options: TokenBucketOptions): TokenBucket
```

Holds up to `capacity` tokens and adds `refillRate` tokens every `interval`. A new bucket starts full. A full refill must take at most 2^50 ms.

```typescript
import { tokenBucket } from "@sanely/ratelimit"

tokenBucket({ refillRate: 5, interval: 60_000, capacity: 50 }) // 50 tokens, 5 more every minute.
```

### Algorithm options

| Type                 | Field        | Description                               |
| -------------------- | ------------ | ----------------------------------------- |
| `WindowOptions`      | `limit`      | The most units in one window.             |
| `WindowOptions`      | `window`     | The window length in milliseconds.        |
| `TokenBucketOptions` | `refillRate` | The tokens added every `interval`.        |
| `TokenBucketOptions` | `interval`   | The time between refills in milliseconds. |
| `TokenBucketOptions` | `capacity`   | The most tokens the bucket holds.         |

## Limiters

### `buildLimiter(options)`

```typescript
function buildLimiter<Supported extends Algorithm>(
  options: BuildLimiterOptions<Supported>
): DefineLimiter<Supported>
```

Binds a store and shared settings, and returns a limiter factory. Settings on a limiter override the settings of the factory.

| Option    | Type                    | Default     | Description                                                                                                                                                                        |
| --------- | ----------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `store`   | `Store<Supported>`      | Required    | The store that holds the counts.                                                                                                                                                   |
| `prefix`  | `string`                | None        | Goes before the limiter name in every key, joined with `:`. Printable ASCII only. Results and headers do not show it.                                                              |
| `timeout` | `number`                | `1000`      | Milliseconds to wait for the store before the result is a store error.                                                                                                             |
| `cache`   | `boolean`               | `true`      | Remember denials in this process until they reset, and skip the store when the same cost comes again. Each limiter remembers at most 10,000 denials, and forgets the oldest first. |
| `mode`    | `"enforce" \| "dryRun"` | `"enforce"` | `"dryRun"` counts normally but allows denied requests.                                                                                                                             |

```typescript
import { buildLimiter } from "@sanely/ratelimit"
import { memoryStore } from "@sanely/ratelimit/stores/memory"

const limiter = buildLimiter({ store: memoryStore(), timeout: 500 })
```

### The limiter factory

```typescript
type DefineLimiter<Supported extends Algorithm> = {
  <Input>(options: LimiterOptions<Supported> & { identify: Identify<Input> }): Limiter<Input>
  (options: LimiterOptions<Supported> & { identify?: undefined }): Limiter
}
```

Defines one limiter. It takes these options, and also `timeout`, `cache`, and `mode` from the table above:

| Option      | Type              | Default  | Description                                                                                                            |
| ----------- | ----------------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| `name`      | `string`          | Required | Labels results and headers, and goes into every key. Printable ASCII only.                                             |
| `algorithm` | `Supported`       | Required | The algorithm that decides. The store must support it.                                                                 |
| `identify`  | `Identify<Input>` | None     | Turns the input into an `Identity`. It can be async. Without it, the input is the identity and its type is `Identity`. |

```typescript
const perIp = limiter({
  name: "api:ip",
  algorithm: slidingWindow({ limit: 30, window: 3_600_000 }),
  identify: (request: Request) => getClientIp(request),
})
```

`getClientIp` stands for the client IP that your platform or trusted proxy gives you. Do not use the raw `X-Forwarded-For` header as the identity: a caller can change its leading value on every request, and each new value gets a fresh count.

### `Identity`

```typescript
type Identity = string | readonly [string, ...string[]] | null
```

The value that a limiter counts against. A tuple combines several parts, and different tuples never share a count. `null` is the global identity, and every request that uses it shares one count. The global identity never shares a count with a string or a tuple.

## Run limiters

### `rateLimit(limiter, input, options?)`

```typescript
function rateLimit<Input>(
  limiter: Limiter<Input>,
  input: Input,
  options?: RateLimitOptions
): Promise<LimitResult>
function rateLimit<Input>(
  limiters: readonly [Limiter<Input>, ...Limiter<Input>[]],
  input: Input,
  options?: RateLimitOptions
): Promise<LimitResults>
```

Spends `cost` units and resolves with the result. It does not reject when the store fails. The result is then a store error.

With an array, `rateLimit` runs the limiters in order and stops at the first denial or store error:

1. It checks the cost against every limiter before it spends anything.
2. It checks the remembered denials of every limiter. A remembered denial stops the request before any limiter spends, and `results` holds only that denial.
3. It runs each limiter. Each limiter checks for a remembered denial again just before it calls the store.

When every limiter allows the request, the result is the allowed result with the fewest units remaining. The result of an enforced limiter takes precedence over the result of a dry-run limiter.

`rateLimit` rejects only with `InvalidOptionError`, or with what your `identify` function throws.

```typescript
const result = await rateLimit([perDevice, perIp, daily], request)
```

`RateLimitOptions`:

| Option | Type     | Default | Description                                                                           |
| ------ | -------- | ------- | ------------------------------------------------------------------------------------- |
| `cost` | `number` | `1`     | The units this request spends: an integer from 1 to each limiter's limit or capacity. |

### `remaining(limiter, input)`

```typescript
function remaining<Input>(limiter: Limiter<Input>, input: Input): Promise<Remaining>
```

Reads the units left without spending any. Resolves with `{ name, limit, remaining, reset }`. Rejects with `StoreError` when the store fails.

```typescript
await remaining(perIp, request) // { name: "api:ip", limit: 30, remaining: 12, reset: 1767225600000 }
```

### `clear(limiter, input)`

```typescript
function clear<Input>(limiter: Limiter<Input>, input: Input): Promise<void>
```

Restores every unit of the identity, and forgets the remembered denial for it. Rejects with `StoreError` when the store fails.

```typescript
await clear(perIp, request)
```

## Results

`LimitResult` is `AllowedResult | DeniedResult | StoreErrorResult`. `LimitResults` is a `LimitResult` with a `results` field that holds every limiter's own result, in order.

| `success` | `reason`       | Type               | Meaning                                                                   |
| --------- | -------------- | ------------------ | ------------------------------------------------------------------------- |
| `true`    | `"store"`      | `AllowedResult`    | The store allowed the request.                                            |
| `true`    | `"dryRun"`     | `AllowedResult`    | The store denied the request, but the limiter is in dry-run mode.         |
| `false`   | `"store"`      | `DeniedResult`     | The store denied the request.                                             |
| `false`   | `"cache"`      | `DeniedResult`     | A denial remembered in this process denied the request without the store. |
| `false`   | `"storeError"` | `StoreErrorResult` | The store failed or timed out. `error` is a `StoreError`.                 |

Every result has `name`, `success`, and `reason`. `AllowedResult` and `DeniedResult` also have these fields:

| Field        | Description                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------- |
| `limit`      | The limit or capacity of the algorithm.                                                         |
| `remaining`  | The units left.                                                                                 |
| `reset`      | When a denied request can succeed, or when the window ends for an allowed request, in epoch ms. |
| `retryAfter` | Milliseconds until `reset`, measured on the store's clock.                                      |
| `window`     | The period that the limit covers, in milliseconds.                                              |

`AllowedResult` also has `mode`, `"enforce"` or `"dryRun"`. `StoreErrorResult` has `error` and no counts, so TypeScript requires a check of `reason` before you read the counts.

```typescript
if (result.reason !== "storeError") {
  result.retryAfter // 1800000
}
```

### `headers(result)`

```typescript
function headers(result: LimitResult): Record<string, string>
```

Returns the `RateLimit-Policy` and `RateLimit` headers of the [IETF RateLimit header fields draft](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/), and `Retry-After` for a denial. The values round seconds up. A store error and the result of a dry-run limiter produce no headers.

```typescript
headers(result)
// {
//   RateLimit: '"api:ip";r=12;t=1800',
//   "RateLimit-Policy": '"api:ip";q=30;w=3600',
//   "Retry-After": "1800", // only for a denial
// }
```

## Stores

### `memoryStore(options?)`

```typescript
import { memoryStore } from "@sanely/ratelimit/stores/memory"

memoryStore()
memoryStore({ clock: () => fakeNow })
```

Counts in the current process. Each instance of your application counts separately, and a restart clears all counts. It keeps one entry for each identity until the state of that identity expires, with no limit on the number of entries.

`MemoryStoreOptions` has one option, `clock`, a function that returns the time in epoch milliseconds. The default is `Date.now`.

### `redisStore(client)`, `valkeyStore(client)`, and `bunRedisStore(client)`

```typescript
import { bunRedisStore } from "@sanely/ratelimit/stores/bun-redis"
import { redisStore } from "@sanely/ratelimit/stores/redis"
import { valkeyStore } from "@sanely/ratelimit/stores/valkey"

redisStore(redis) // An ioredis or node-redis client.
valkeyStore(valkey) // An iovalkey client.
bunRedisStore(new Bun.RedisClient(process.env.REDIS_URL))
```

| Function        | Entry point                          | Client type                        |
| --------------- | ------------------------------------ | ---------------------------------- |
| `redisStore`    | `@sanely/ratelimit/stores/redis`     | `IoredisClient \| NodeRedisClient` |
| `valkeyStore`   | `@sanely/ratelimit/stores/valkey`    | `IovalkeyClient`                   |
| `bunRedisStore` | `@sanely/ratelimit/stores/bun-redis` | `BunRedisClient`                   |

The three stores run the same Lua scripts, so they count the same way. They work with Redis 7 or later and Valkey 7.2 or later, on any server that speaks the Redis protocol and runs Lua scripts.

- Each check runs one script with `EVALSHA`, and loads the script with `EVAL` when the server does not have it.
- The scripts read the time with `TIME`.
- Every check touches a single key, as Redis Cluster requires.
- Keys expire when their state no longer matters.
- A client's `keyPrefix` applies to every key that the store writes and clears. The client adds it before the factory `prefix`.

Each entry point also exports `InvalidReplyError`.

### `Store`

```typescript
type Store<Supported extends Algorithm = Algorithm> = {
  readonly consume: (request: StoreRequest<Supported>) => Promise<StoreResult>
  readonly clear: (key: string) => Promise<void>
}
```

The contract of a store. `Supported` limits the algorithms that a limiter of the store can use.

| Type           | Field       | Description                                                                        |
| -------------- | ----------- | ---------------------------------------------------------------------------------- |
| `StoreRequest` | `key`       | The limiter key: the prefix, the name, and the encoded identity.                   |
| `StoreRequest` | `algorithm` | The algorithm to apply.                                                            |
| `StoreRequest` | `cost`      | A whole number from 0 to the capacity of the algorithm. 0 reads without writing.   |
| `StoreResult`  | `success`   | `true` when the store allowed the request.                                         |
| `StoreResult`  | `remaining` | The units left.                                                                    |
| `StoreResult`  | `reset`     | When the request can next succeed if denied, or when the window ends, in epoch ms. |
| `StoreResult`  | `now`       | The store's clock when it decided, in epoch ms.                                    |

A store must follow these rules:

- Each `consume` call is atomic. Concurrent calls for one key, from any process, behave as if they ran one after another.
- A denial changes nothing.
- A cost of 0 reads without writing.
- The store's own clock decides.
- The arithmetic matches the built-in stores in `src/lib/transitions/index.ts`.

## Errors

| Error                | Entry point                  | Fields            | When                                                                                         |
| -------------------- | ---------------------------- | ----------------- | -------------------------------------------------------------------------------------------- |
| `InvalidOptionError` | `@sanely/ratelimit`          | `option`, `value` | A limit, window, interval, capacity, refill rate, timeout, name, prefix, or cost is invalid. |
| `StoreError`         | `@sanely/ratelimit`          | `cause`           | The store failed. A store error result carries it.                                           |
| `StoreTimeoutError`  | `@sanely/ratelimit`          | `timeout`         | The store did not answer in time. The `cause` of a `StoreError`.                             |
| `InvalidReplyError`  | Each Redis store entry point | `reply`           | Redis returned an unexpected reply. The `cause` of a `StoreError`.                           |

## Types

| Type                                                                               | Describes                                                |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `Algorithm`                                                                        | `FixedWindow \| SlidingWindow \| TokenBucket`.           |
| `FixedWindow`, `SlidingWindow`, `TokenBucket`                                      | The values that the algorithm functions return.          |
| `WindowOptions`, `TokenBucketOptions`                                              | The arguments of the algorithm functions.                |
| `BuildLimiterOptions`                                                              | The argument of `buildLimiter`.                          |
| `LimiterOptions`                                                                   | The argument of the limiter factory, without `identify`. |
| `LimiterSettings`                                                                  | `timeout`, `cache`, and `mode`.                          |
| `Mode`                                                                             | `"enforce" \| "dryRun"`.                                 |
| `DefineLimiter`                                                                    | The limiter factory that `buildLimiter` returns.         |
| `Limiter<Input>`                                                                   | A limiter definition. It has `name`.                     |
| `Identify<Input>`                                                                  | `(input: Input) => Identity \| Promise<Identity>`.       |
| `Identity`                                                                         | See [`Identity`](#identity).                             |
| `RateLimitOptions`                                                                 | The options of `rateLimit`.                              |
| `LimitResult`, `LimitResults`, `AllowedResult`, `DeniedResult`, `StoreErrorResult` | See [Results](#results).                                 |
| `Remaining`                                                                        | The value that `remaining` resolves with.                |
| `Store`, `StoreRequest`, `StoreResult`                                             | See [`Store`](#store).                                   |
| `MemoryStoreOptions`                                                               | The options of `memoryStore`.                            |
| `IoredisClient`, `NodeRedisClient`, `IovalkeyClient`, `BunRedisClient`             | The client shapes that the Redis stores accept.          |
