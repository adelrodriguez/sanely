# How to count in Durable Objects

This guide shows you how to rate limit a Cloudflare Worker with the Durable Object store. Each key gets its own Durable Object, which applies the algorithm and saves the counts, so a limit holds across every Worker that shares the namespace.

1. Export `RateLimitObject` from your Worker's main module, and pass the store its binding:

   ```typescript
   import { buildLimiter, fixedWindow, rateLimit } from "@sanely/ratelimit"
   import { durableObjectStore, RateLimitObject } from "@sanely/ratelimit/stores/durable-object"

   export { RateLimitObject }

   export default {
     async fetch(request, env) {
       const limiter = buildLimiter({ store: durableObjectStore(env.RATE_LIMITS) })
       const perIp = limiter({
         name: "api:ip",
         algorithm: fixedWindow({ limit: 100, window: "1m" }),
       })

       const result = await rateLimit(perIp, request.headers.get("cf-connecting-ip"))

       if (!result.success) return new Response("Too many requests", { status: 429 })
       return new Response("OK")
     },
   } satisfies ExportedHandler<Env>
   ```

2. Bind the class in your Wrangler configuration, with SQLite storage:

   ```jsonc
   {
     "durable_objects": {
       "bindings": [{ "name": "RATE_LIMITS", "class_name": "RateLimitObject" }],
     },
     "migrations": [{ "tag": "v1", "new_sqlite_classes": ["RateLimitObject"] }],
   }
   ```

   The store needs SQLite storage, because each check reads and writes with its synchronous key-value API.

3. Run `wrangler types` to type `env.RATE_LIMITS` as `DurableObjectNamespace<RateLimitObject>`.

## Use another class name

The `class_name` in the binding is the name that your Worker exports. To give the class another name, export it under that name:

```typescript
export { RateLimitObject as RateLimits } from "@sanely/ratelimit/stores/durable-object"
```

The class name is part of your Durable Object migrations, so choose it before you deploy.

## Know the limits

- Each key has one object, in one location. A check from far away waits for the round trip to that object. Denials that the limiter remembers skip the round trip.
- One object handles a limited number of requests each second. Cloudflare documents a soft limit of about 1,000. The [global identity](identify-the-caller.md), `null`, sends every request to one object, so give a busy limiter an identity that spreads the load.
- Each object deletes its counts with an alarm when they expire, so an identity that stops sending requests leaves no storage behind.
- The entry point only loads in workerd. Node.js, Bun, and other runtimes cannot import it.
