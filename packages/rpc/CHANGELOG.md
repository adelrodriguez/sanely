# @sanely/rpc

## 0.1.0

### Minor Changes

- 664a457: Fix `receivePort` waiting forever when the page calls it after the port arrived

  `relayPort` posted each port into the page as soon as it arrived, and the page loses a window message it isn't listening for yet. Now `receivePort` asks for a port when it starts listening, and `relayPort` holds each port until a page asks. The page can call `receivePort` at any time, such as from a module that loads late, or before the relay starts. Receivers waiting at the same time each get their own port, and a port on its way to a receiver that gives up goes to the next one.

  If your page reads the relayed port with its own `message` listener instead of `receivePort`, it no longer receives the port. To migrate, call `receivePort` with the same channel string in the renderer.

- 664a457: Fix `connect` sessions that share one wire taking each other's replies and cancels

  Every session numbered its calls from 0, so two sessions calling over the same MessagePort or socket could resolve a call with the other session's result. Each message now carries a protocol marker, `rpc: 1`, and the calling session's id, and a session settles only with the replies to its own calls. A message without the marker is ignored as foreign traffic.

  A session without a `router` no longer answers requests. It used to reply with a `ChannelError` with code `no-router`, which reached the caller before the real result when a serving session shared its end of the wire. The `no-router` code is removed, and a call to a wire with no serving end now fails with `timeout`.

  This changes the wire format, and a peer on 0.0.0 ignores the new messages. To migrate:

  1. Upgrade both ends of every wire together.
  2. Remove any handling of the `no-router` code.
  3. Serve several routers over one wire from one session, by combining them with `mergeRouters`.

- 1e9e8a3: Add the `ChannelError` code `application`, so a resolver can send its own failure with typed data to the caller

  A resolver can now throw `new ChannelError({ code: "application", data })`. The error always crosses `toWire`, `connect`, and `fetchHandler` without an `expose` predicate, and the caller gets a `ChannelError` with the same `data`. `fetchHandler` answers it with status 422. Use `data` to carry a serialized error, such as one from a `@sanely/errors` registry, and rebuild it on the client.

- 65c01a5: Accept time expressions such as `"5s"` for the `connect` timeout, and drop the `Ms` suffix from its name

  `connect(wire, { timeout: "5s" })` is the same as `timeout: 5000`, and `timeout: Infinity` still turns the timeout off. The type checker checks a literal expression with `@sanely/duration`, so `"1M"` fails to compile with the reason. A string from config needs `isTimeExpression` from `@sanely/duration` first. `connect` throws a `SetupError` with the code `invalid-timeout` for a string that is not a time expression.

  To migrate, rename the `connect` option `timeoutMs` to `timeout`. The `timeout` `ChannelError`'s `timeoutMs` field is now `timeout`, and it still holds milliseconds. A peer on an older version sends a `timeout` error with `timeoutMs`, which this version does not read, so upgrade both ends of a `connect` together.

  `@sanely/rpc` now depends on `@sanely/duration`.

- 664a457: Add `@sanely/rpc/wire/fetch` to serve a router over HTTP and call it with `fetch`

  `fetchHandler(router, options)` returns a fetch handler for Hono, Next.js route handlers, Bun, Deno, or Cloudflare Workers. `fetchTransport(url, options)` returns a transport for `createClient`. Each call is one `POST`, failures keep their `ChannelError` code and fields, and the status follows the outcome: 400 for `validation`, 404 for `unknown-channel`, and 500 for a hidden failure. The handler derives each call's context from its request with `context`, and the transport cancels a call with `$with({ signal })`.

- 664a457: Reject a `connect` `timeout` that isn't a positive length of time up to 24.8 days or `Infinity`

  `NaN`, such as from an unset environment variable, turned the timeout off, so calls to a dead peer waited forever. Zero, a negative value, or a value above 2,147,483,647 ms, the longest delay `setTimeout` holds, timed out every call at once. `connect` now throws a `SetupError` with the new code `invalid-timeout`.

  If you switch over every `SetupError` code, add a case for `invalid-timeout`.

### Patch Changes

- 664a457: Fix one call on a pending wire closing the whole `connect` session when the wire cannot send its payload

  A call queued before the wire arrived, such as one made before `whenOpen` resolves, could carry a payload the wire cannot send, like a BigInt over a WebSocket. When the wire arrived, that send closed the session and failed every other call. Now only that call rejects, with the wire's error, as it already did on a wire that was there from the start.

- 664a457: Fix `createClient`, `createRouter`, and `implement` accepting a contract with reserved or dotted keys when it skips `defineContract`

  A plain object contract with a key such as `"a.b"` beside a nested `a.b` leaf made one channel silently replace the other. These functions now throw the same `SetupError` as `defineContract`, with code `dotted-key` or `reserved-key`.

- 664a457: Fix `sendPort` never posting the port when called right after `await win.loadURL(...)`

  Electron resolves `loadURL` while `webContents.isLoading()` is still true, so `sendPort` waited for a `did-finish-load` event that had already fired. `sendPort` now waits for `did-stop-loading`, the event that ends loading.

- 664a457: Fix reading an unknown `$` key on a client node, such as `$$typeof`, making a call that rejects unhandled

  Only `$path`, `$input`, `$output`, and `$with` are helpers now. Every other `$` key is `undefined`, so tools that probe objects, such as Vitest's pretty-format and React's development checks, no longer trigger a call.

- Updated dependencies [a72bd6a]
- Updated dependencies [a72bd6a]
- Updated dependencies [e6ab5a0]
- Updated dependencies [a72bd6a]
- Updated dependencies [a72bd6a]
  - @sanely/duration@0.1.0
