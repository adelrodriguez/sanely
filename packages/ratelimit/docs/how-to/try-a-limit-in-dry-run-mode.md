# How to try a limit in dry-run mode

This guide shows you how to see how often a new limit would deny requests before you enforce it.

1. Set `mode: "dryRun"` on the new limiter:

   ```typescript
   const perDevice = limiter({
     name: "suggestions:device",
     algorithm: slidingWindow({ limit: 10, window: "1h" }),
     identify: deviceOf,
     mode: "dryRun",
   })
   ```

2. Run it with your enforced limiters, and log each result whose `reason` is `"dryRun"`:

   ```typescript
   const result = await rateLimit([perDevice, perIp], c)

   for (const each of result.results) {
     if (each.reason === "dryRun") logger.info({ limiter: each.name }, "Rate limit would deny")
   }
   ```

3. When the logs show the rate that you expect, remove `mode: "dryRun"`.

A dry-run limiter counts normally, but it allows each request that it would deny. It never stops a chain of limiters, even when its store fails, and it never decides a chain that has an enforced limiter. A store error from a dry-run limiter has `mode: "dryRun"`. It does not use the denial cache, and it produces no headers.
