# How to handle store errors

This guide shows you how to decide what happens to a request when the store fails or does not answer within `timeout`.

By default, a store error refuses the request. The result has `success: false`, `reason: "storeError"`, and an `error` that is a `StoreError` with the original error as its `cause`. A store error does not mean that the store counted nothing. A command that timed out can still complete in the store.

## Let requests through on some routes

If a route can accept requests without a limit for the length of an outage, check `reason` in your middleware:

```typescript
export function withRateLimit(limiters, { onStoreError = "deny" } = {}) {
  return createMiddleware(async (c, next) => {
    const result = await rateLimit(limiters, c)

    if (result.reason === "storeError") {
      logger.warn({ limiter: result.name, error: result.error }, "Rate limit store unavailable")

      if (onStoreError === "allow") return next()
    }

    // ...
  })
}

app.get("/v1/invites/:code", withRateLimit([perIpInvites], { onStoreError: "allow" }), invite)
```

Keep the default on routes that protect spending, such as calls to a paid API.

## Fall back to a count in each instance

To keep a limit during an outage, run a second limiter on a memory store when the first limiter returns a store error:

```typescript
import { memoryStore } from "@sanely/ratelimit/stores/memory"

const local = buildLimiter({ store: memoryStore() })

const perIpLocal = local({
  name: "suggestions:ip",
  algorithm: slidingWindow({ limit: 10, window: "1h" }),
  identify: ipOf,
})

let result = await rateLimit(perIp, c)
if (result.reason === "storeError") result = await rateLimit(perIpLocal, c)
```

Give the local limiter a lower limit, because each instance counts separately. With four instances, a local limit of 10 allows up to 40 requests in total.

## Fail at once when Redis is down

By default, the Redis clients queue commands until they reconnect, so each request waits for the full `timeout`. To fail at once instead, set `enableOfflineQueue: false` on an ioredis, iovalkey, or Bun client, or set `disableOfflineQueue: true` on a node-redis client.

To wait a different time for the store, set `timeout` on `buildLimiter` or on one limiter, in milliseconds or as a time expression such as `"500ms"`. The default is `1000`.
