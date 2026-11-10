# How to map thrown errors to domain errors

This guide shows you how to turn the errors that a function throws into your own error types, so that callers see domain failures and not the internals of a library.

## Choose the form of `run`

If `UnhandledException` is an acceptable failure for the caller, use the function form:

```ts
import * as try$ from "@sanely/try"

const url = try$.runSync(() => new URL(link))
// url is URL | UnhandledException

const response = await try$.run(async () => {
  return fetch("https://api.example.com/session", { method: "DELETE" })
})
// response is Response | UnhandledException
```

The original error is the `cause` of the `UnhandledException`.

If callers should receive a domain failure, use the object form with `try` and `catch`.

## Map every failure to one domain error

Return one error type from `catch` when the caller does not need to tell the failures apart:

```ts
class PaymentUnavailableError extends Error {}

const payment = await try$.run({
  try: async () => {
    const response = await fetch("https://payments.example.com/charges/ch_123")

    if (!response.ok) {
      throw new Error(`unexpected status ${response.status}`)
    }

    return (await response.json()) as { amount: number; captured: boolean }
  },
  catch: () => new PaymentUnavailableError("payment provider unavailable"),
})

// payment is { amount: number; captured: boolean } | PaymentUnavailableError
```

## Map different failures to different errors

`catch` receives the original error, so you can check it and return a different type for each case:

```ts
class MalformedRequestError extends Error {}
class UnsupportedVersionError extends Error {}

const body = try$.runSync({
  try: () => {
    const parsed = JSON.parse(rawBody) as { version: number; items: string[] }

    if (parsed.version !== 2) {
      throw new RangeError(`unsupported version ${parsed.version}`)
    }

    return parsed
  },
  catch: (error) => {
    if (error instanceof SyntaxError) {
      return new MalformedRequestError("body is not valid JSON")
    }

    return new UnsupportedVersionError("only version 2 is supported")
  },
})

// body is { version: number; items: string[] } | MalformedRequestError | UnsupportedVersionError
```

## Handle the result

Check the result where you receive it:

```ts
if (body instanceof MalformedRequestError) {
  return new Response("Bad request", { status: 400 })
}
```

`catch` must not throw. A `catch` that throws, or that rejects in `run`, `all`, or `flow`, is a `Panic`. In `runSync`, `catch` must not return a promise.

`catch` receives only errors that started inside `try`. A `TimeoutError` or a `CancellationError` from the call's own policy never goes through `catch`. One that `try` rethrows from a nested call is an ordinary error, so `catch` receives it. To handle those, see [How to add retries, a deadline, and cancellation](./add-retries-a-deadline-and-cancellation.md).
