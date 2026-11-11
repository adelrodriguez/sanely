<div align="center">
  <h1 align="center">✋🏻 <code>@sanely/ratelimit</code></h1>

  <p align="center">
    <strong>Atomic rate limiting with pluggable stores</strong>
  </p>
</div>

`@sanely/ratelimit` counts requests in a store that every instance of your application shares, so a limit holds across instances and restarts. Each check runs as one atomic step inside the store, so requests that arrive together can never pass a limit together.

You define limiters once and run them with plain functions. The package has no framework integrations. You write your own middleware for Hono, Express, or another framework in a few lines.

## Features

- **Atomic.** Each check runs as one indivisible step in the store, such as a Lua script in Redis.
- **Three algorithms.** Fixed window, sliding window, and token bucket. A denied request spends nothing, the limiter checks the cost before it spends any units, and a denial reports the exact time the request can succeed.
- **Your Redis client as it is.** Pass an ioredis, node-redis, iovalkey, or Bun client directly to its store, with no adapter and no type assertions.
- **Cloudflare Workers.** Count in Durable Objects, one object for each key.
- **Safe on failure.** When the store fails, the result is never a success, so a spending cap stays a cap.
- **One clock.** Windows follow the store's clock, so instances with clocks that drift agree.
- **Composable.** Limiters are definitions that plain functions run, so you can build middleware for any platform.
- **Typed.** The input type of each limiter comes from how it identifies the caller.
- **No external dependencies.** The only runtime dependency is [`@sanely/duration`](../duration).

## Install

```sh
npm install @sanely/ratelimit
```

The package needs Node.js 22 or later, or Bun 1.4 or later. The Durable Object store runs in Cloudflare Workers.

## Get started

Create a limiter factory with a store, define a limiter, and run it:

```typescript
import { buildLimiter, rateLimit, slidingWindow } from "@sanely/ratelimit"
import { redisStore } from "@sanely/ratelimit/stores/redis"
import Redis from "ioredis"

const redis = new Redis(process.env.REDIS_URL)

const limiter = buildLimiter({
  store: redisStore(redis),
})

const perIp = limiter({
  name: "api:ip",
  algorithm: slidingWindow({ limit: 30, window: "1h" }),
})

const result = await rateLimit(perIp, ip)

if (!result.success) {
  // Refuse the request.
}
```

A window, an interval, or a timeout takes milliseconds or a time expression from [`@sanely/duration`](../duration), such as `"1h"`.

## Documentation

How-to guides:

- [How to identify the caller](docs/how-to/identify-the-caller.md)
- [How to run several limiters for one request](docs/how-to/run-several-limiters.md)
- [How to charge more than one unit for a request](docs/how-to/spend-more-than-one-unit.md)
- [How to write rate limit middleware](docs/how-to/write-middleware.md)
- [How to handle store errors](docs/how-to/handle-store-errors.md)
- [How to try a limit in dry-run mode](docs/how-to/try-a-limit-in-dry-run-mode.md)
- [How to share a store with other apps](docs/how-to/share-a-store-with-other-apps.md)
- [How to count in Durable Objects](docs/how-to/count-in-durable-objects.md)
- [How to write a store](docs/how-to/write-a-store.md)

Reference:

- [`@sanely/ratelimit` reference](docs/reference.md)

Explanation:

- [About the design of `@sanely/ratelimit`](docs/explanation/about-the-design.md)

To work on the package, read [architecture](docs/architecture.md), [testing](docs/testing.md), and [benchmarks](docs/benchmarks.md).

## License

MIT. See [LICENSE](../../LICENSE).
