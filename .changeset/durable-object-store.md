---
"@sanely/ratelimit": minor
---

Add a store for Cloudflare Durable Objects

`@sanely/ratelimit/stores/durable-object` exports `durableObjectStore` and the `RateLimitObject` class. Export the class from your Worker, bind it with SQLite storage, and pass the binding to `durableObjectStore`. Each key gets its own object, which runs each check atomically on its own clock and deletes its counts with an alarm when they expire. The entry point loads only in workerd.
