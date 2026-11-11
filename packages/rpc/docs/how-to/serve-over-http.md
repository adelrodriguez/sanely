# How to serve a contract over HTTP

This guide serves every channel from one fetch handler and calls it with `fetch`. The handler works in any framework that accepts a fetch handler, such as Hono, Next.js route handlers, Bun, Deno, and Cloudflare Workers.

`@sanely/rpc/wire/fetch` handles the HTTP details. Each call is one `POST` to `<url>/<path>`, and every response carries an envelope. A validation failure on the server reaches the client as a `ChannelError` with its code and `issues`.

## Serve the router

Pass the router to `fetchHandler` and mount the result on any prefix. The last segment of the URL names the channel.

```typescript
import { fetchHandler } from "@sanely/rpc/wire/fetch"

export const POST = fetchHandler(router, {
  onHidden: (error) => console.error(error),
})
```

`fetchHandler` hides server-side failures by default. A resolver that throws, or returns a value that fails `output`, reaches the caller as a `ChannelError` with code `internal`. The real error goes to `onHidden`.

The response status follows the outcome: 200 on success, 400 for `validation`, 404 for `unknown-channel`, 422 for `application`, and 500 for a hidden failure. A method other than `POST` gets 405.

## Call it from the client

```typescript
import { createClient } from "@sanely/rpc"
import { fetchTransport } from "@sanely/rpc/wire/fetch"

const api = createClient(contract, fetchTransport("/rpc"))
```

The client reads the outcome from the envelope, not from the status. If a proxy returns an HTML error page, the call rejects with a `ChannelError` with code `malformed-envelope`.

## Pass a context from the request

When the router needs a context, derive it from each request. A `context` function that throws fails the call like a resolver would, so an auth failure stays hidden unless you expose it.

```typescript
export const POST = fetchHandler(router, {
  context: async (request) => ({ userId: await authenticate(request) }),
})
```

Send the credentials from the client with `headers`. A function runs for every call, so it can read a token that changes:

```typescript
const api = createClient(
  contract,
  fetchTransport("/rpc", { headers: () => ({ authorization: `Bearer ${getToken()}` }) })
)
```

## Send an application error to the caller

To send an error with its fields, wrap it in a `ChannelError` with code `application`. It always crosses, so you don't need `expose`. Put any value the wire can carry in `data`:

```typescript
import { ChannelError } from "@sanely/rpc"

throw new ChannelError({ code: "application", data: { id, reason: "not-found" } })
```

The client gets a `ChannelError` with the same code and `data`. `@sanely/rpc` never inspects `data`, so validate it before you trust it:

```typescript
try {
  await api.notes.open({ path })
} catch (error) {
  if (error instanceof ChannelError && error.code === "application") {
    const failure = NoteFailure.parse(error.data)
  }
}
```

To keep the error's class, serialize it into `data` and rebuild it on the client. With a `@sanely/errors` registry that both sides import, `Faults.toSerializable(error)` goes into `data` and `Faults.fromSerializable(error.data)` rebuilds it. A registry serializes the stack and the cause chain, so remove what the caller should not see.

## Show a hidden error to the caller

To let the caller see an error such as "not found", pass `expose`:

```typescript
export const POST = fetchHandler(router, {
  expose: (error) => error instanceof NotFoundError,
  onHidden: (error) => console.error(error),
})
```

## Cancel a call

The transport takes a `signal` per call, so `$with` cancels the request:

```typescript
await api.$with({ signal: AbortSignal.timeout(5000) }).notes.open({ path })
```

The call rejects with the signal's reason. On the server, the request's own signal reaches the resolver, so a client that disconnects aborts it.

## Keep payloads JSON-safe

The body is JSON, so payloads must survive `JSON.stringify`, as over a WebSocket. A leaf with no input sends no body, so `undefined` and `null` stay distinct.
