# About the design of `@sanely/ratelimit`

This page explains the choices behind the package: why each check is atomic in the store, how the three algorithms differ, and why a failure never lets a request through by default.

## Each check is one atomic step in the store

A rate limit that holds across instances needs one shared count. If an instance reads the count and then writes a new count in a second command, two requests that arrive together can both read the same count, and both pass a limit that only one of them fits. For this reason, a store applies the algorithm and writes the new state in one indivisible step. The Redis stores do this with one Lua script for each check, and every check touches a single key, as Redis Cluster requires.

The same reason excludes key-value abstractions such as unstorage drivers. They have no atomic read-and-write, so they cannot keep a limit under concurrent load.

## The store's clock decides

Each instance of an application has its own clock, and clocks drift. If each instance computed window boundaries from its own clock, two instances could disagree about which window a request belongs to. The Redis scripts read the time with `TIME`, so every instance uses the clock of the server. `retryAfter` is also measured on the store's clock.

## The three algorithms

A fixed window counts units in windows that start at multiples of the window length since the epoch. It is exact and cheap. Its weak point is the boundary: a client can spend a full limit at the end of one window and a full limit again at the start of the next.

A sliding window smooths that boundary. It adds the count of the current window to the count of the previous window, weighted by how much of the previous window the last full window length still covers. A burst at the boundary then still counts against the next window.

A token bucket allows bursts up to its capacity, then a steady rate as it refills. Use it when short bursts are acceptable but the long-run rate must stay fixed.

All three share three rules. A denied request spends nothing. The limiter checks the cost before it spends any units. A denial reports the exact time that the same request can succeed, so `retryAfter` is an exact wait.

The durations have a limit of 2^50 ms, about 35,000 years. Every store sets an expiry up to two periods after now, and computes it in floating point. A longer period would give expiry times that are not safe integers, and Redis rejects an expiry that is not an integer after the script has already written the state.

## `identify` always returns an identity

`identify` has no way to skip a limiter. If it had one, a client could avoid a limit when it leaves out the header that `identify` reads. Instead, `identify` returns `null` for such a request, and every request without the header shares the global count. The global identity never shares a count with a string or a tuple.

## A store error is never a success

When the store fails, the package cannot know whether the request fits. It returns a store error, and a store error has `success: false`. Code that checks only `success` then refuses the request. A limit that protects spending, such as calls to a paid API, stays in force during an outage. Routes that prefer to stay open can choose that in their middleware. See [How to handle store errors](../how-to/handle-store-errors.md).

A store error is also not proof that the store counted nothing. A command that timed out can still complete in the store, then or later.

## Denials are remembered in each process

A caller who has used up a limit often keeps sending requests. Each of those requests would ask the store, only to get the same denial. So each limiter remembers its denials in the process until they reset, and denies the same cost again without a store call. The cache holds at most 10,000 denials for each limiter, because callers can choose their identities. A forgotten denial is safe, because the next request asks the store.

A remembered denial answers only the cost that was denied. A larger cost is denied too, but its reset is later and depends on the algorithm, so the store must say when.

## No framework integrations

Limiters are definitions, and plain functions run them. Middleware for a framework is then a few lines of your own code, with your own choices about status codes, headers, and store errors. See [How to write rate limit middleware](../how-to/write-middleware.md).

## Compared with other libraries

|                         | `@sanely/ratelimit`        | hono-rate-limiter        | rate-limiter-flexible |
| ----------------------- | -------------------------- | ------------------------ | --------------------- |
| Stores                  | Redis, Valkey, Bun, memory | Memory, Redis, unstorage | Many                  |
| Algorithms              | Fixed, sliding, bucket     | Fixed                    | Fixed                 |
| Counts across instances | Yes                        | Not with memory          | Yes                   |
| Atomic in every store   | Yes                        | Not with unstorage       | Yes                   |
| Framework integrations  | None, by design            | Hono                     | None                  |
