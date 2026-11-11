import type { Transport } from "#lib/core/transport.ts"
import type { DispatchOptions, Router } from "#lib/server/router.ts"
import { ChannelError } from "#lib/core/error.ts"
import { isRecord } from "#lib/core/guards.ts"
import type { Wire } from "./types"
import { deferWire, subscribe } from "./deferred"
import { type ExposeOptions, fromWire, toWire } from "./envelope"

// Every message carries the protocol marker and the calling session's id, `sid`. A reply and a
// cancel echo the caller's `sid`, so sessions that share a wire never take each other's replies,
// and a message without the marker is foreign traffic. `result` stays unknown until `fromWire`
// validates it: the peer is the source.
type WireMessage =
  | { kind: "cancel"; id: number; sid: string }
  | { kind: "req"; id: number; path: string; payload: unknown; sid: string }
  | { kind: "res"; id: number; result: unknown; sid: string }

const PROTOCOL = 1

const DEFAULT_TIMEOUT_MS = 30_000

type PendingEntry = {
  fail: (error: ChannelError) => void
  settle: (result: unknown) => void
}

type CallOptions = {
  /**
   * Aborts this call: it rejects with `signal.reason`, a late reply is dropped, and the peer aborts
   * the `signal` its resolver received.
   */
  signal?: AbortSignal
}

// `connect` passes `context` to every dispatch it serves, so it demands `context` as `dispatch`
// does: required unless the context type is `void`. The optional `context` below is where
// `Context` is inferred from when the options give no router.
type ConnectOptions<Context> = ExposeOptions & {
  context?: Context
  router?: Router<Context>
  signal?: AbortSignal
  /**
   * Bounds each outgoing call. Defaults to 30 seconds; `Infinity` disables it.
   */
  timeoutMs?: number
} & Pick<DispatchOptions<Context>, "context">

/**
 * Wires one end of a duplex pipe into the library: serves incoming requests through `router` (omit
 * it for a call-only end) and returns a `Transport` for calling the peer, with request/response
 * correlation handled internally. Fully symmetric — call it on both ends with the roles swapped.
 *
 * A pipe is one peer, so `context` is per-connection: whatever identity the edge established (the
 * session, the window) is passed to every dispatch this end serves. It is required when the
 * router's context type isn't `void`.
 *
 * Failures this end serves are hidden from the peer exactly as `toWire` hides them: caller-fault
 * codes cross intact, everything else crosses as code `internal` and goes to `onHidden`. A trusted
 * peer (a worker, your own processes) can see everything with `expose: () => true`.
 *
 * `timeoutMs` bounds each outgoing call (default 30 seconds) so a dead peer rejects calls instead
 * of leaving them pending forever; pass `Infinity` to opt out when something else, such as `close`,
 * covers liveness. The transport also takes `{ signal }` per call, so `api.$with({ signal })`
 * cancels from the client; the call rejects with `signal.reason`. A call that is aborted or times
 * out tells the peer, which aborts the `signal` its resolver received; closing the session aborts
 * every resolver this end is running.
 *
 * The session ends on `close(reason?)` or when `options.signal` aborts (its reason becomes the
 * close reason): everything in flight and every future call rejects with a `ChannelError` (code
 * `closed`, the reason in `cause`) and this end stops serving. Tie it to whatever liveness signal
 * the pipe has (a window's `closed`, a socket's `close`). `closed` resolves with that error once it
 * happens.
 *
 * The wire may be a promise — a port that hasn't been handed over yet, a socket that hasn't opened.
 * Calls made in the meantime queue (bounded by `timeoutMs`) and flush when it resolves; `close`
 * before it arrives wins the race, and a rejected wire promise closes the connection with the
 * rejection as the reason.
 */
export function connect<Context = void>(
  wire: Wire | Promise<Wire>,
  options?: ConnectOptions<Context>
): {
  close: (reason?: unknown) => void
  closed: Promise<ChannelError>
  transport: Transport<CallOptions>
} {
  // A wire that is already here has nothing buffered, so nothing to withdraw.
  const { wire: source, withdraw } =
    "send" in wire
      ? { wire, withdraw: (): boolean => false }
      : deferWire(wire, (reason) => {
          close(reason)
        })
  const {
    context,
    expose,
    onHidden,
    router,
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options ?? {}
  // `Router<Context>`'s rest tuple is a conditional TypeScript cannot resolve for a generic Context
  const dispatch = router?.dispatch as
    | ((
        path: string,
        raw: unknown,
        options: { context?: Context; signal?: AbortSignal }
      ) => Promise<unknown>)
    | undefined
  const sid = createSessionId()
  const pending = new Map<number, PendingEntry>()
  // Requests this end is serving, by the caller's session and id, so a cancel reaches its resolver.
  const serving = new Map<string, AbortController>()
  let nextId = 0
  let closed: ChannelError | undefined
  let resolveClosed: ((error: ChannelError) => void) | undefined
  const whenClosed = new Promise<ChannelError>((resolve) => {
    resolveClosed = resolve
  })

  const unsubscribe = subscribe(source, (data) => {
    // Anything that doesn't parse is not ours on a shared wire; ignore it.
    const message = closed ? undefined : parseMessage(data)

    if (message?.kind === "req") {
      void respond(message)
      return
    }

    if (message?.kind === "res" && message.sid === sid) {
      pending.get(message.id)?.settle(message.result)
      return
    }

    if (message?.kind === "cancel") {
      serving.get(servingKey(message))?.abort()
    }
  })

  const onAbort = (): void => {
    close(signal?.reason)
  }

  function close(reason?: unknown): void {
    if (closed) {
      return
    }

    closed = new ChannelError({ code: "closed" }, { cause: reason })
    unsubscribe?.()
    signal?.removeEventListener("abort", onAbort)

    // Each entry deletes only itself as it fails, which Map iteration tolerates.
    for (const entry of pending.values()) {
      entry.fail(closed)
    }

    for (const controller of serving.values()) {
      controller.abort(closed)
    }

    resolveClosed?.(closed)
  }

  if (signal?.aborted) {
    onAbort()
  } else {
    signal?.addEventListener("abort", onAbort, { once: true })
  }

  return {
    close,
    closed: whenClosed,
    transport: (path, payload, callOptions) =>
      new Promise((resolve, reject) => {
        const callSignal = callOptions?.signal

        if (closed) {
          reject(closed)
          return
        }

        // Throwing in the executor rejects with the raw reason, as fetch does.
        callSignal?.throwIfAborted()

        const id = nextId
        nextId += 1
        // Kept by identity, so `cancelRemote` can withdraw it from a pending wire's buffer.
        const request = { id, kind: "req", path, payload, rpc: PROTOCOL, sid }

        const cleanup = (): void => {
          pending.delete(id)
          clearTimeout(timer)
          callSignal?.removeEventListener("abort", onCallAbort)
        }
        const onCallAbort = (): void => {
          cleanup()
          cancelRemote(request)
          // oxlint-disable-next-line prefer-promise-reject-errors -- an abort rejects with the caller's own reason, as fetch does
          reject(callSignal?.reason)
        }
        // `setTimeout` would fire an `Infinity` delay immediately.
        const timer = Number.isFinite(timeoutMs)
          ? setTimeout(() => {
              cleanup()
              cancelRemote(request)
              reject(new ChannelError({ code: "timeout", path, timeoutMs }))
            }, timeoutMs)
          : undefined

        callSignal?.addEventListener("abort", onCallAbort, { once: true })
        pending.set(id, {
          fail: (error: ChannelError) => {
            cleanup()
            reject(error)
          },
          settle: (result) => {
            cleanup()

            // Adopting a promise carries fromWire's throw through as the rejection.
            resolve(Promise.resolve(result).then(fromWire))
          },
        })

        try {
          source.send(request)
        } catch (error) {
          // A synchronously-throwing send (DataCloneError on a non-cloneable
          // payload) rejects the caller; don't leak the pending entry.
          cleanup()
          throw error
        }
      }),
  }

  // Best effort: if the pipe is gone, so is the peer's reason to keep working. A request still
  // buffered on a pending wire is withdrawn instead: the peer never saw it, so it needs no cancel,
  // and the buffer must not keep its payload until the wire arrives.
  function cancelRemote(request: { id: number }): void {
    if (closed || withdraw(request)) {
      return
    }

    try {
      source.send({ id: request.id, kind: "cancel", rpc: PROTOCOL, sid })
    } catch {
      // Same as a lost reply: nothing to recover, and nobody awaits this.
    }
  }

  async function respond(message: Extract<WireMessage, { kind: "req" }>): Promise<void> {
    const controller = new AbortController()
    const key = servingKey(message)
    serving.set(key, controller)

    const result = await toWire(
      dispatch
        ? // The thunk form lets toWire capture even a synchronously-throwing dispatch.
          () => dispatch(message.path, message.payload, { context, signal: controller.signal })
        : Promise.reject(new ChannelError({ code: "no-router" })),
      {
        expose,
        // A resolver that failed because the caller cancelled is not a failure worth logging.
        onHidden: (error) => {
          if (!controller.signal.aborted) {
            onHidden?.(error)
          }
        },
      }
    )

    if (serving.get(key) === controller) {
      serving.delete(key)
    }

    // A cancelled caller already stopped listening for this id.
    if (!closed && !controller.signal.aborted) {
      try {
        source.send({ id: message.id, kind: "res", result, rpc: PROTOCOL, sid: message.sid })
      } catch {
        // The pipe died between request and reply; `respond` runs unawaited, so
        // swallowing here is what keeps this from becoming an unhandled
        // rejection. The peer's own timeout covers the lost reply.
      }
    }
  }
}

function parseMessage(data: unknown): WireMessage | undefined {
  if (!isRecord(data)) {
    return undefined
  }

  const { id, kind, rpc, sid } = data

  if (rpc !== PROTOCOL || typeof id !== "number" || typeof sid !== "string") {
    return undefined
  }

  if (kind === "req" && typeof data.path === "string") {
    return { id, kind, path: data.path, payload: data.payload, sid }
  }

  if (kind === "res") {
    return { id, kind, result: data.result, sid }
  }

  if (kind === "cancel") {
    return { id, kind, sid }
  }

  return undefined
}

function servingKey(message: { id: number; sid: string }): string {
  return `${message.sid}:${message.id}`
}

// Unique per session, across every realm that may share a wire. `getRandomValues` works outside
// secure contexts, where `randomUUID` is missing.
function createSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
}
