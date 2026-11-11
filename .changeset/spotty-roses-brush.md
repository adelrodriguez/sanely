---
"@sanely/rpc": minor
---

Add `@sanely/rpc/wire/fetch` to serve a router over HTTP and call it with `fetch`

`fetchHandler(router, options)` returns a fetch handler for Hono, Next.js route handlers, Bun, Deno, or Cloudflare Workers. `fetchTransport(url, options)` returns a transport for `createClient`. Each call is one `POST`, failures keep their `ChannelError` code and fields, and the status follows the outcome: 400 for `validation`, 404 for `unknown-channel`, and 500 for a hidden failure. The handler derives each call's context from its request with `context`, and the transport cancels a call with `$with({ signal })`.
