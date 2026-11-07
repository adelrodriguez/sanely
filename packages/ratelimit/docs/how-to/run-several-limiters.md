# How to run several limiters for one request

This guide shows you how to apply several limits to one request, such as a limit for each device, a limit for each IP address, and a global daily total.

1. Define the limiters with the same input type:

   ```typescript
   const perDevice = limiter({ name: "suggestions:device", algorithm, identify: deviceOf })
   const perIp = limiter({ name: "suggestions:ip", algorithm, identify: ipOf })
   const daily = limiter({
     name: "suggestions:daily",
     algorithm: dailyAlgorithm,
     identify: () => null,
   })
   ```

2. Put the broadest limit, such as the global daily total, last. Limiters that run before a denial have already spent, so only requests that pass the narrower limits then spend from the broad limit.

3. Pass the limiters to `rateLimit` as an array:

   ```typescript
   const result = await rateLimit([perDevice, perIp, daily], c)

   result.name // the limiter that decided
   result.results // the result of each limiter that ran, in order
   ```

`rateLimit` stops at the first denial or store error. When every limiter allows the request, the result is the allowed result with the fewest units remaining.

When this process remembers a denial for any of the limiters, the request stops before any limiter spends. A caller who has used up a broad limit then gets a denial from memory, with no store call, until the limit resets. In that case, `results` holds only that denial. To turn this off for a limiter, set `cache: false` on it.

Refer to the [`rateLimit` reference](../reference.md#ratelimitlimiter-input-options) for the full order of the checks.
