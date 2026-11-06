# Limiters are definitions built by a factory

`buildLimiter({ store, ...defaults })` returns a function that defines limiters, as `buildGate` does in gated. A limiter is a definition: standalone functions (`rateLimit`, `remaining`, `clear`, `headers`) run it. Applications compose these functions into middleware for their own platform, so the package has no framework integrations. Stores stay plain `Store` values instead of becoming factories, so that the store contract stays small for store authors and stores can be passed to tests and wrappers.

## Consequences

`rateLimit` accepts several limiters and runs them in order. It stops at the first denial or store error, but limiters that ran earlier have already spent. Put broad limits, such as a daily total, last. An atomic check across several limits is deferred.
