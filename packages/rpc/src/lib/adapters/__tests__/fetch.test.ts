import { describe, expect, test, vi } from "vitest"
import * as z from "zod"
import { fetchHandler, fetchTransport } from "#lib/adapters/fetch.ts"
import { createClient } from "#lib/client/index.ts"
import { defineContract, channel } from "#lib/core/contract.ts"
import { ChannelError } from "#lib/core/error.ts"
import { createRouter } from "#lib/server/router.ts"

const URL_BASE = "http://rpc.test/rpc"

const contract = defineContract({
  echoNull: channel({ input: z.null(), output: z.null() }),
  notes: {
    open: channel({ input: z.object({ path: z.string() }), output: z.string() }),
  },
  ping: channel({ input: z.void(), output: z.literal("pong") }),
})

// Hands each request to `handler` in memory and settles like `fetch`: an aborted signal rejects
// with its reason at once, whatever the handler is still doing.
function viaHandler(handler: (request: Request) => Promise<Response>) {
  const requests: Request[] = []

  const send = (url: string, init: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      const { signal } = init

      signal?.throwIfAborted()
      signal?.addEventListener(
        "abort",
        () => {
          // oxlint-disable-next-line prefer-promise-reject-errors -- an abort rejects with the caller's own reason, as fetch does
          reject(signal.reason)
        },
        { once: true }
      )

      const request = new Request(url, init)
      requests.push(request)
      handler(request).then(resolve).catch(reject)
    })

  return { requests, send }
}

function serve(router = createRouter(contract, resolvers())) {
  const handler = fetchHandler(router)
  const { requests, send } = viaHandler(handler)

  return {
    api: createClient(contract, fetchTransport(URL_BASE, { fetch: send })),
    handler,
    requests,
    send,
  }
}

function resolvers() {
  return {
    echoNull: ({ input }: { input: null }) => input,
    "notes.open": ({ input: { path } }: { input: { path: string } }) => `contents of ${path}`,
    ping: () => "pong" as const,
  }
}

async function post(handler: (request: Request) => Promise<Response>, path: string, body?: string) {
  const response = await handler(
    new Request(`${URL_BASE}/${path}`, { body: body ?? null, method: "POST" })
  )

  return { body: (await response.json()) as unknown, status: response.status }
}

describe("fetchHandler and fetchTransport", () => {
  test("round-trip a call over one POST per call", async () => {
    const { api, requests } = serve()

    await expect(api.notes.open({ path: "/a.md" })).resolves.toBe("contents of /a.md")
    expect(requests.map((request) => [request.method, request.url])).toEqual([
      ["POST", `${URL_BASE}/notes.open`],
    ])
  })

  test("keep a void input and a null input distinct", async () => {
    const { api } = serve()

    await expect(api.ping()).resolves.toBe("pong")
    await expect(api.echoNull(null)).resolves.toBeNull()
  })

  test("carry validation failures with their issues and status 400", async () => {
    const { handler, send } = serve()
    const transport = fetchTransport(URL_BASE, { fetch: send })

    // The raw transport skips the client's own parse, so the server's rejection crosses.
    await expect(Promise.resolve(transport("notes.open", { path: 1 }))).rejects.toMatchObject({
      code: "validation",
      issues: [{ path: ["path"] }],
    })
    await expect(post(handler, "notes.open", '{"path":1}')).resolves.toMatchObject({
      body: { error: { detail: { code: "validation" } }, ok: false },
      status: 400,
    })
  })

  test("answer an unknown channel with unknown-channel and status 404", async () => {
    const { handler } = serve()

    await expect(post(handler, "notes.delete", "{}")).resolves.toMatchObject({
      body: { error: { detail: { code: "unknown-channel", path: "notes.delete" } } },
      status: 404,
    })
  })

  test("decode an escaped channel name", async () => {
    const dotted = defineContract({ "a b": channel({ input: z.string(), output: z.string() }) })
    const handler = fetchHandler(createRouter(dotted, { "a b": ({ input }) => input }))
    const { send } = viaHandler(handler)

    await expect(
      createClient(dotted, fetchTransport(URL_BASE, { fetch: send }))["a b"]("hi")
    ).resolves.toBe("hi")
  })

  test("hide a resolver's failure as internal with status 500, reporting it to onHidden", async () => {
    const crash = new Error("db password is hunter2")
    const hidden: unknown[] = []
    const handler = fetchHandler(
      createRouter(contract, {
        ...resolvers(),
        "notes.open": () => {
          throw crash
        },
      }),
      { onHidden: (error) => hidden.push(error) }
    )

    await expect(post(handler, "notes.open", '{"path":"/a.md"}')).resolves.toEqual({
      body: {
        error: { detail: { code: "internal" }, message: "Internal error", name: "ChannelError" },
        ok: false,
      },
      status: 500,
    })
    expect(hidden).toEqual([crash])
  })

  test("let expose send an application error as-is", async () => {
    class NotFoundError extends Error {
      override name = "NotFoundError"
    }

    const handler = fetchHandler(
      createRouter(contract, {
        ...resolvers(),
        "notes.open": () => {
          throw new NotFoundError("no note /a.md")
        },
      }),
      { expose: (error) => error instanceof NotFoundError }
    )
    const { send } = viaHandler(handler)
    const api = createClient(contract, fetchTransport(URL_BASE, { fetch: send }))

    await expect(api.notes.open({ path: "/a.md" })).rejects.toMatchObject({
      message: "no note /a.md",
      name: "NotFoundError",
    })
  })

  test("derive each call's context from its request", async () => {
    const sessionContract = defineContract({
      whoami: channel({ input: z.void(), output: z.string() }),
    })
    const router = createRouter<typeof sessionContract, { userId: string }>(sessionContract, {
      whoami: ({ context }) => context.userId,
    })
    const handler = fetchHandler(router, {
      context: (request) => ({ userId: request.headers.get("x-user") ?? "anonymous" }),
    })
    const { send } = viaHandler(handler)
    let token = "ada"
    const api = createClient(
      sessionContract,
      fetchTransport(URL_BASE, { fetch: send, headers: () => ({ "x-user": token }) })
    )

    await expect(api.whoami()).resolves.toBe("ada")
    token = "grace"
    await expect(api.whoami()).resolves.toBe("grace")
  })

  test("fail the call, hidden, when deriving the context throws", async () => {
    const sessionContract = defineContract({
      whoami: channel({ input: z.void(), output: z.string() }),
    })
    const hidden: unknown[] = []
    const denied = new Error("no session")
    const handler = fetchHandler(
      createRouter<typeof sessionContract, { userId: string }>(sessionContract, {
        whoami: ({ context }) => context.userId,
      }),
      {
        context: () => {
          throw denied
        },
        onHidden: (error) => hidden.push(error),
      }
    )

    await expect(post(handler, "whoami")).resolves.toMatchObject({
      body: { error: { detail: { code: "internal" } } },
      status: 500,
    })
    expect(hidden).toEqual([denied])
  })

  test("answer a body that isn't JSON with validation and status 400", async () => {
    const { handler } = serve()

    await expect(post(handler, "notes.open", "{not json")).resolves.toMatchObject({
      body: {
        error: {
          detail: { code: "validation", issues: [{ message: "The request body is not JSON" }] },
        },
      },
      status: 400,
    })
  })

  test("answer a method other than POST with 405", async () => {
    const { handler } = serve()
    const response = await handler(new Request(`${URL_BASE}/ping`))

    expect(response.status).toBe(405)
    expect(response.headers.get("allow")).toBe("POST")
  })

  test("reject a response that isn't an envelope with malformed-envelope", async () => {
    const api = createClient(
      contract,
      fetchTransport(URL_BASE, {
        fetch: () => Promise.resolve(new Response("<h1>502 Bad Gateway</h1>", { status: 502 })),
      })
    )

    const error = await api.ping().catch((error: unknown) => error)

    expect(error).toBeInstanceOf(ChannelError)
    expect(error).toMatchObject({ cause: expect.any(SyntaxError), code: "malformed-envelope" })
  })

  test("cancel with $with: the call rejects with the reason and the resolver's signal aborts", async () => {
    const signals: AbortSignal[] = []
    const hidden: unknown[] = []
    const handler = fetchHandler(
      createRouter(contract, {
        ...resolvers(),
        "notes.open": ({ signal }) => {
          signals.push(signal)
          return new Promise<string>((_resolve, reject) => {
            signal.addEventListener("abort", () => {
              reject(new Error("stopped"))
            })
          })
        },
      }),
      { onHidden: (error) => hidden.push(error) }
    )
    const { send } = viaHandler(handler)
    const api = createClient(contract, fetchTransport(URL_BASE, { fetch: send }))
    const controller = new AbortController()

    const call = api.$with({ signal: controller.signal }).notes.open({ path: "/a.md" })
    await vi.waitFor(() => {
      expect(signals).toHaveLength(1)
    })
    controller.abort("gave up")

    await expect(call).rejects.toBe("gave up")
    await vi.waitFor(() => {
      expect(signals[0]?.aborted).toBe(true)
    })
    expect(hidden).toEqual([])
  })

  test("send headers given as a value and keep a content type the caller sets", async () => {
    const { requests, send } = serve()
    const api = createClient(
      contract,
      fetchTransport(`${URL_BASE}/`, {
        fetch: send,
        headers: { authorization: "Bearer t", "content-type": "application/json; charset=utf-8" },
      })
    )

    await api.ping()

    expect(requests[0]?.url).toBe(`${URL_BASE}/ping`)
    expect(requests[0]?.headers.get("authorization")).toBe("Bearer t")
    expect(requests[0]?.headers.get("content-type")).toBe("application/json; charset=utf-8")
  })
})
