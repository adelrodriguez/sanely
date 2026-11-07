# How to add retries, a deadline, and cancellation

This guide shows you how to put a retry policy, a total deadline, and external cancellation around one operation.

1. Declare the policy before the terminal call:

   ```ts
   import * as try$ from "@sanely/try"

   class RejectedUploadError extends Error {}

   const controller = new AbortController()

   const etag = await try$
     .retry({
       backoff: "exponential",
       delayMs: 100,
       maxDelayMs: 5_000,
       jitter: true,
       limit: 5,
       // Retry server errors, and give up at once when the server rejects the request.
       shouldRetry: (error) => !(error instanceof RejectedUploadError),
     })
     .timeout(30_000)
     .signal(controller.signal)
     .run(async ({ signal, retry }) => {
       console.log(`upload attempt ${retry.attempt} of ${retry.limit}`)

       const response = await fetch("https://api.example.com/backups", {
         method: "PUT",
         body: backupData,
         signal,
       })

       if (response.status >= 500) {
         throw new Error(`server error ${response.status}`)
       }

       if (!response.ok) {
         throw new RejectedUploadError(`rejected with status ${response.status}`)
       }

       return response.headers.get("etag")
     })
   ```

   For a fixed number of attempts with no delay, use `retry(3)`. The limit counts the first attempt.

2. Pass `signal` from the context to the I/O in the work. It combines your external signal with the deadline, so one `fetch` option covers both. Cancellation is cooperative, so work that ignores `signal` keeps running.

3. Handle the policy failures at the call site with the type guards from `@sanely/try/errors`:

   ```ts
   import { isCancellationError, isRetryExhaustedError, isTimeoutError } from "@sanely/try/errors"

   if (isTimeoutError(etag)) {
     // The 30 second deadline expired across all attempts.
   }

   if (isCancellationError(etag)) {
     // The controller aborted.
   }

   if (isRetryExhaustedError(etag)) {
     // Every attempt failed, or shouldRetry declined. The last error is etag.cause.
   }
   ```

   Use the guards, not `instanceof`. The guards also match by `name`, so they work when two copies of the package are installed, or when the error comes from another realm.

## Map the last error to a domain error

If you give `catch`, the error of the last attempt goes through `catch`, and the result has no `RetryExhaustedError`:

```ts
class RateUnavailableError extends Error {}

const rate = await try$
  .retry({ backoff: "exponential", delayMs: 200, maxDelayMs: 2_000, limit: 4 })
  .timeout(10_000)
  .run({
    try: async ({ signal }) => {
      const response = await fetch("https://api.example.com/rates/EUR", { signal })

      if (!response.ok) {
        throw new Error(`unexpected status ${response.status}`)
      }

      const data = (await response.json()) as { usd: number }
      return data.usd
    },
    catch: () => new RateUnavailableError("exchange rate service unavailable"),
  })

// rate is number | RateUnavailableError | TimeoutError
```

## Retry synchronous work

`runSync` stays available after `retry(3)`, the number form. It is not available after the object form of `retry`, `timeout`, or `signal`, because those policies can wait or interrupt. For a synchronous retry, use the number form.

## Know what the deadline covers

`timeout(ms)` is one total deadline. Attempts, the delays between them, and `catch` all count against it. It does not restart for each attempt.

Refer to the [`retry` reference](../reference.md#retrypolicy) for every option and the delay formulas.
