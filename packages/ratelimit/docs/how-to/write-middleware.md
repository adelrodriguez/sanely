# How to write rate limit middleware

This guide shows you how to run limiters in middleware, send the rate limit headers, and refuse denied requests with status 429.

## Write Hono middleware

```typescript
import type { Context } from "hono"
import { headers, rateLimit, type Limiter } from "@sanely/ratelimit"
import { createMiddleware } from "hono/factory"

export function withRateLimit(limiters: [Limiter<Context>, ...Array<Limiter<Context>>]) {
  return createMiddleware(async (c, next) => {
    const result = await rateLimit(limiters, c)

    for (const [name, value] of Object.entries(headers(result))) c.header(name, value)

    if (!result.success) {
      return c.json({ error: "rate_limited", limit: result.name }, 429)
    }

    await next()
  })
}

app.post("/v1/goals/suggestions", withRateLimit([perDevice, perIp, daily]), suggest)
```

## Write Express middleware

```typescript
import type { NextFunction, Request, Response } from "express"
import { headers, rateLimit, type Limiter } from "@sanely/ratelimit"

export function withRateLimit(limiters: [Limiter<Request>, ...Array<Limiter<Request>>]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const result = await rateLimit(limiters, req)

    res.set(headers(result))

    if (!result.success) return res.status(429).json({ error: "rate_limited" })

    next()
  }
}
```

`headers(result)` returns no headers for a store error or for the result of a dry-run limiter. Refer to the [`headers` reference](../reference.md#headersresult) for the format.

Code that checks only `success` refuses a request when the store fails. To change that, see [How to handle store errors](./handle-store-errors.md).
