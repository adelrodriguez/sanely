import type { Transport } from "#lib/core/transport.ts"
import type { MaybePromise } from "#lib/core/types.ts"
import type { Router } from "#lib/server/router.ts"
import { ChannelError, type ChannelErrorDetail } from "#lib/core/error.ts"
import { type ExposeOptions, fromWire, toWire, type WireResult } from "#lib/wire/envelope.ts"

/**
 * An HTTP edge for a router, built on the Fetch API's `Request` and `Response`: one `POST` per call
 * to `<url>/<dotted path>`, with a JSON body and a `WireResult` envelope in the response. It runs
 * wherever a fetch handler does: Hono, Next.js route handlers, Bun, Deno, Cloudflare Workers.
 */

/**
 * `fetchHandler`'s options. `context` derives each call's context from its request, such as the
 * session behind an auth header. It is required when the router's context type isn't `void`. A
 * `context` that throws fails the call like a resolver would, hidden unless `expose` accepts it.
 */
export type FetchHandlerOptions<Context = void> = ExposeOptions
  // oxlint-disable-next-line no-invalid-void-type -- void is the no-context sentinel, as in `DispatchOptions`
  & ([Context] extends [void]
    ? { context?: undefined }
    : { context: (request: Request) => MaybePromise<Context> })

/**
 * `fetchTransport`'s options. `headers` is sent with every call. A function runs per call, so it
 * can read a token that changes. `fetch` replaces the global `fetch`, for a test or a custom
 * client.
 */
export type FetchTransportOptions = {
  fetch?: (url: string, init: RequestInit) => Promise<Response>
  headers?: HeadersInit | (() => MaybePromise<HeadersInit>)
}

// The status of a failed call, for logs and middleware. The client reads the outcome from the
// envelope, never from the status. Only the always-exposed codes cross by default: the rest reach a
// response only when `expose` lets them through.
const STATUS: Record<ChannelErrorDetail["code"], number> = {
  closed: 502,
  internal: 500,
  "malformed-envelope": 502,
  "no-router": 500,
  "output-validation": 500,
  timeout: 504,
  "unknown-channel": 404,
  validation: 400,
}

type Dispatch = (
  path: string,
  raw: unknown,
  options: { context?: unknown; signal: AbortSignal }
) => Promise<unknown>

/**
 * Serves every channel of `router` from one fetch handler. The last segment of the request's URL
 * names the channel, so mount the handler on any prefix, such as `/rpc/*`.
 *
 * Every response is a `WireResult` envelope, with status 200 on success, 400 for `validation`, 404
 * for `unknown-channel`, and 500 for a hidden failure. A body that isn't JSON is a `validation`
 * failure, and a method other than `POST` gets 405. The request's `signal` reaches the resolver, so
 * a client that disconnects aborts it, and its failure is not reported to `onHidden`.
 */
export function fetchHandler<Context = void>(
  router: Router<Context>,
  // oxlint-disable-next-line no-invalid-void-type -- void is the no-context sentinel; it makes the options optional
  ...[options]: [Context] extends [void]
    ? [options?: FetchHandlerOptions<Context>]
    : [options: FetchHandlerOptions<Context>]
): (request: Request) => Promise<Response> {
  // The rest tuple resolves per Context; inside, every variant reads as the widest one
  const { context, expose, onHidden } = (options ?? {}) as ExposeOptions & {
    context?: (request: Request) => unknown
  }
  // `Router<Context>`'s rest tuple is a conditional TypeScript cannot resolve for a generic Context
  const served = router as unknown as { dispatch: Dispatch }

  return async (request) => {
    if (request.method !== "POST") {
      return new Response(null, { headers: { allow: "POST" }, status: 405 })
    }

    const envelope = await toWire(
      async () =>
        await served.dispatch(pathOf(request), await payloadOf(request), {
          context: await context?.(request),
          signal: request.signal,
        }),
      {
        expose,
        // A resolver that failed because the client went away is not a failure worth logging.
        onHidden: (error) => {
          if (!request.signal.aborted) {
            onHidden?.(error)
          }
        },
      }
    )

    return Response.json(envelope, { status: statusOf(envelope) })
  }
}

/**
 * Calls a `fetchHandler` at `url`: a `Transport` for `createClient` that takes `{ signal }` per
 * call, so `api.$with({ signal })` cancels the request. A failure arrives as it would over any
 * wire: a `ChannelError` keeps its code and fields. A response that isn't an envelope, such as a
 * proxy's HTML error page, rejects with a `ChannelError` with code `malformed-envelope`.
 *
 * The body is JSON, so payloads must survive it, as over a WebSocket. A leaf with no input sends no
 * body, so `undefined` and `null` stay distinct.
 */
export function fetchTransport(
  url: string,
  options: FetchTransportOptions = {}
): Transport<{ signal?: AbortSignal }> {
  const { fetch: send = fetch, headers } = options
  const base = url.endsWith("/") ? url : `${url}/`

  return async (path, payload, callOptions) => {
    const requestHeaders = new Headers(typeof headers === "function" ? await headers() : headers)

    if (!requestHeaders.has("content-type")) {
      requestHeaders.set("content-type", "application/json")
    }

    const response = await send(`${base}${encodeURIComponent(path)}`, {
      body: payload === undefined ? null : JSON.stringify(payload),
      headers: requestHeaders,
      method: "POST",
      signal: callOptions?.signal ?? null,
    })

    return fromWire(await readEnvelope(response))
  }
}

function pathOf(request: Request): string {
  const segment = new URL(request.url).pathname.split("/").at(-1) ?? ""

  try {
    return decodeURIComponent(segment)
  } catch {
    // A malformed escape names no channel, so the router answers `unknown-channel` for it.
    return segment
  }
}

async function payloadOf(request: Request): Promise<unknown> {
  const text = await request.text()

  if (text === "") {
    return undefined
  }

  try {
    const payload: unknown = JSON.parse(text)
    return payload
  } catch (error) {
    throw new ChannelError(
      { code: "validation", issues: [{ message: "The request body is not JSON" }] },
      { cause: error }
    )
  }
}

async function readEnvelope(response: Response): Promise<unknown> {
  const text = await response.text()

  try {
    const envelope: unknown = JSON.parse(text)
    return envelope
  } catch (error) {
    throw new ChannelError({ code: "malformed-envelope" }, { cause: error })
  }
}

function statusOf(envelope: WireResult): number {
  if (envelope.ok) {
    return 200
  }

  return envelope.error.detail ? STATUS[envelope.error.detail.code] : 500
}
