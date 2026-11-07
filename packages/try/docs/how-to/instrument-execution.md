# How to log and trace execution with `wrap`

This guide shows you how to add logs, traces, or metrics around a terminal call without a change to the work or to the result.

1. Start the chain with `wrap`. Call `next()` to run the work, and return its result:

   ```ts
   import * as try$ from "@sanely/try"

   const results = await try$
     .wrap(async (ctx, next) => {
       const start = performance.now()

       try {
         return await next()
       } finally {
         const elapsed = Math.round(performance.now() - start)
         console.log(`settled after ${ctx.retry.attempt} attempt(s) in ${elapsed}ms`)
       }
     })
     .retry(3)
     .run(async () => {
       const response = await fetch("https://api.example.com/search?q=shoes")
       return (await response.json()) as Array<{ id: string }>
     })
   ```

2. Read the context, but do not change it. `ctx` is read-only. `ctx.retry.attempt` is live: after `next()` settles, it shows the final attempt count.

A wrap surrounds the whole terminal call, retries included. To add several wraps, chain them: `.wrap(first).wrap(second)`.

Put every `wrap` first in the chain. `wrap` is not available after `retry`, `timeout`, or `signal`.
