---
"@sanely/try": patch
---

Let `runSync` run every retry policy without a delay

`runSync` now accepts a retry policy whose `delay` is omitted or `0`, whatever its `backoff` or `jitter`. For example, `retry({ backoff: "linear", limit: 3 }).runSync(fn)` compiles and runs. It used to fail to compile, and at run time it threw a `Panic` with the code `RUN_SYNC_ASYNC_RETRY_POLICY`. A policy with a delay still hides `runSync` and still throws that `Panic` from untyped code.
