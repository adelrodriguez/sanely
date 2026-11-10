# How to pass a duration to an API that takes a number

This guide shows you how to give a timer, a header, or a library option a readable duration, such as `"5m"`, in the unit that it expects.

1. Find the unit that the API expects. Timers and most JavaScript APIs, such as `setTimeout` and `AbortSignal.timeout`, take milliseconds. HTTP headers, such as `Cache-Control`, and most token formats take seconds.

2. If the API takes milliseconds, call `ms`:

   ```ts
   import { ms } from "@sanely/duration"

   setTimeout(refresh, ms("5m"))
   const signal = AbortSignal.timeout(ms("30s"))
   ```

3. If the API takes another unit, call the unit function for that unit, such as `seconds`:

   ```ts
   import { seconds } from "@sanely/duration"

   const headers = { "Cache-Control": `max-age=${seconds("1h")}` } // { "Cache-Control": "max-age=3600" }
   ```

   Give the expression a unit, such as `"30s"`. A bare number, such as `"30"`, means milliseconds, so `seconds("30")` is a type error.

4. If the duration comes from a config file or an environment variable, call `convert` with the unit:

   ```ts
   import { convert } from "@sanely/duration"

   const maxAge = convert(process.env.CACHE_TTL ?? "1h", "seconds")
   ```

   `convert` accepts a compound expression, such as `"1h 30m"`, and throws `InvalidTimeExpressionError` for an invalid value. To reject the value without an error, follow [How to validate a time expression from user input](validate-user-input.md).

5. Check the unit at each call. A result such as `seconds("5m")` is still a number, so `setTimeout(refresh, seconds("5m"))` compiles and waits 300 milliseconds. Only `format` rejects a result in the wrong unit, because it takes milliseconds.

Refer to the [`@sanely/duration` reference](../reference.md) for every unit function and the `Duration` type.
