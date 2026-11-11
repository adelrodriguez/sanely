# How to identify the caller

This guide shows you how to tell a limiter which identity to count against, such as an IP address, a device, a user, or one shared count for every request.

## Pass the identity directly

Without `identify`, you pass the identity itself to `rateLimit`:

```typescript
import { fixedWindow, rateLimit } from "@sanely/ratelimit"

const perKey = limiter({ name: "api:key", algorithm: fixedWindow({ limit: 100, window: "1m" }) })

await rateLimit(perKey, apiKey)
```

## Read the identity from your input

Add `identify` to turn your input into an identity. Its parameter type becomes the input type of the limiter:

```typescript
import type { Context } from "hono"
import { rateLimit, slidingWindow } from "@sanely/ratelimit"

const perDevice = limiter({
  name: "suggestions:device",
  algorithm: slidingWindow({ limit: 10, window: "1h" }),
  identify: (c: Context) => c.req.header("x-device-id") ?? null,
})

await rateLimit(perDevice, c) // c must be a Context
```

`identify` can be async.

If a header can be missing, return `null` for it, as `perDevice` does. Then every request without the header shares the global count. You cannot skip a limiter from `identify`. [About the design](../explanation/about-the-design.md#identify-always-returns-an-identity) explains why.

## Count against several parts

To count against a combination, such as an organization and a user, return a tuple:

```typescript
identify: (c: Context) => [c.get("orgId"), c.get("userId")]
```

The limiter encodes the parts, so different tuples never share a count.

## Set one count for every request

To set a global limit, return `null` for every request:

```typescript
const daily = limiter({
  name: "suggestions:daily",
  algorithm: fixedWindow({ limit: 2_000, window: "1d" }),
  identify: () => null,
})
```

The global identity never shares a count with a string or a tuple.

Refer to the [`Identity` reference](../reference.md#identity) for the full type.
