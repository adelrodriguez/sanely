import type { Wire } from "#lib/wire/types.ts"
import { isRecord } from "#lib/core/guards.ts"
import { randomId } from "#lib/core/id.ts"
import { SetupError } from "#lib/core/setup-error.ts"

/**
 * `Wire` constructors for postMessage-shaped pipes, plus the Electron hand-off that gets a port
 * from the main process into a page. The port flavors share an idea but not a surface — a DOM
 * `MessagePort` speaks `addEventListener` and wraps data in an event, Electron's `MessagePortMain`
 * is an emitter that also wraps, Node's `worker_threads` port is an emitter that doesn't — which is
 * exactly the kind of difference that rots in hand-copied snippets. Every parameter is structural,
 * so nothing here depends on Electron or the DOM, even for types.
 */

/**
 * The shape of an Electron `MessagePortMain` — satisfied in the main process and in utility
 * processes alike (both ends of a `MessageChannelMain` are this flavor, wherever they land).
 */
export type MainPortLike = {
  postMessage(message: unknown): void
  on(event: "message", listener: (event: { data: unknown }) => void): unknown
  removeListener(event: "message", listener: (event: { data: unknown }) => void): unknown
  start(): void
}

/**
 * Wraps an Electron `MessagePortMain` (main or utility process) as a `Wire`.
 */
export function mainPort(port: MainPortLike): Wire {
  return {
    onMessage: (listener) => {
      const handle = (event: { data: unknown }): void => {
        listener(event.data)
      }

      port.on("message", handle)
      // Ports buffer until start(); the listener is attached, so nothing is lost.
      port.start()

      return () => {
        port.removeListener("message", handle)
      }
    },
    send: (data) => {
      port.postMessage(data)
    },
  }
}

/**
 * The shape of a DOM `MessagePort` — renderers, iframes, web workers.
 */
export type DomPortLike = {
  postMessage(message: unknown): void
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void
  removeEventListener(type: "message", listener: (event: { data: unknown }) => void): void
  start(): void
}

/**
 * Wraps a DOM `MessagePort` as a `Wire`.
 */
export function domPort(port: DomPortLike): Wire {
  return {
    onMessage: (listener) => {
      const handle = (event: { data: unknown }): void => {
        listener(event.data)
      }

      port.addEventListener("message", handle)
      port.start()

      return () => {
        port.removeEventListener("message", handle)
      }
    },
    send: (data) => {
      port.postMessage(data)
    },
  }
}

/**
 * The shape of a `node:worker_threads` message end — a `MessagePort`, a `Worker`, or `parentPort`.
 * Unlike the other flavors, listeners receive the value directly (no wrapping event), and
 * subscribing implicitly starts the port.
 */
export type NodePortLike = {
  postMessage(value: unknown): void
  on(event: "message", listener: (value: unknown) => void): unknown
  removeListener(event: "message", listener: (value: unknown) => void): unknown
}

/**
 * Wraps a `node:worker_threads` port, `Worker`, or `parentPort` as a `Wire`.
 */
export function nodePort(port: NodePortLike): Wire {
  return {
    onMessage: (listener) => {
      port.on("message", listener)

      return () => {
        port.removeListener("message", listener)
      }
    },
    send: (data) => {
      port.postMessage(data)
    },
  }
}

// ---------------------------------------------------------------------------------------------
// The Electron hand-off: three functions, two ends, one channel string. A MessagePort cannot
// cross contextBridge, but window.postMessage can transfer it — so main ships the port to the
// page's IPC channel (sendPort), the preload relays it into the window (relayPort), and the
// renderer awaits it (receivePort). Keep the channel string in shared code so all three agree.
//
// A window message is not buffered: one posted before its listener exists is lost. So the
// receiver asks the relay for a port, the relay holds each port until a receiver asks, and either
// may start first. The messages, all on `type`:
//
// - `want` (page to relay): the receiver with this `id` is listening for a port.
// - `ready` (relay to page): a relay started. Every waiting receiver asks again, because a request
//   posted before the relay listened is lost. The relay takes one request from each `id`.
// - `port` (relay to page): the port for the receiver with this `id`, transferred with it.
// - `withdraw` (page to relay): the receiver gave up. It keeps listening until `withdrawn`.
// - `withdrawn` (relay to page): the relay holds no request for this `id`. A port it already sent
//   arrives first, because a window delivers its messages in order.
// - `return` (page to relay): a port that reached its receiver after it gave up, sent back for the
//   next receiver.
// ---------------------------------------------------------------------------------------------

type HandOffMessage =
  | { id: string; kind: "port" | "return" | "want" | "withdraw" | "withdrawn"; type: string }
  | { kind: "ready"; type: string }

const ADDRESSED_KINDS: ReadonlySet<unknown> = new Set([
  "port",
  "return",
  "want",
  "withdraw",
  "withdrawn",
])

type PortMessageEvent = { data: unknown; ports: readonly DomPortLike[]; source: unknown }

/**
 * The slice of a DOM `window` the hand-off touches.
 */
export type MessageWindowLike = {
  addEventListener(type: "message", listener: (event: PortMessageEvent) => void): void
  removeEventListener(type: "message", listener: (event: PortMessageEvent) => void): void
  postMessage(message: unknown, targetOrigin: string, transfer?: readonly unknown[]): void
  location?: { origin: string }
}

function defaultWindow(caller: string): MessageWindowLike {
  const candidate: unknown = Reflect.get(globalThis, "window")

  if (!isMessageWindow(candidate)) {
    throw new SetupError({ caller, code: "no-window" })
  }

  return candidate
}

function isMessageWindow(value: unknown): value is MessageWindowLike {
  return (
    isRecord(value)
    && typeof value.addEventListener === "function"
    && typeof value.removeEventListener === "function"
    && typeof value.postMessage === "function"
  )
}

/**
 * Renderer end of the hand-off: resolves with the port the preload relays on `type`. The guard
 * accepts only same-window messages carrying the agreed type and an actual port, which shuts out
 * senders in _other_ windows — an iframe, a compromised `opener`. It cannot shut out a script
 * already running in this window (`event.source` names the sending window, not the sending script),
 * and no postMessage protocol can; same-window injection defeats the page wholesale. Feed the
 * result to {@link domPort}; `connect` accepts the pending promise directly:
 * `connect(receivePort("app:port").then(domPort), { router })`.
 *
 * A port that never arrives leaves the promise pending; bound the wait with `signal`
 * (`AbortSignal.timeout(5000)`), which rejects with `signal.reason`. `target` replaces the global
 * `window`.
 */
export function receivePort(
  type: string,
  options: { signal?: AbortSignal; target?: MessageWindowLike } = {}
): Promise<DomPortLike> {
  const { signal } = options
  const win = options.target ?? defaultWindow("receivePort")
  const id = randomId()
  const send = (kind: "return" | "want" | "withdraw", ports?: readonly unknown[]): void => {
    win.postMessage({ id, kind, type } satisfies HandOffMessage, originOf(win), ports)
  }

  return new Promise((resolve, reject) => {
    // Throwing in the executor rejects with the raw reason, as fetch does.
    signal?.throwIfAborted()

    // Listening until the port arrives, or draining after an abort until the relay confirms the
    // withdrawal, so a port already on its way is returned instead of lost.
    let state: "draining" | "listening" = "listening"

    const stop = (): void => {
      win.removeEventListener("message", handle)
      signal?.removeEventListener("abort", onAbort)
    }
    const onAbort = (): void => {
      state = "draining"
      send("withdraw")
      // oxlint-disable-next-line prefer-promise-reject-errors -- an abort rejects with the caller's own reason, as fetch does
      reject(signal?.reason)
    }
    const handle = (event: PortMessageEvent): void => {
      const message = event.source === win ? parseHandOff(event.data, type) : undefined

      if (message?.kind === "ready") {
        // A relay that started late missed what this receiver posted, so post it again.
        send(state === "listening" ? "want" : "withdraw")
        return
      }

      if (message?.id !== id) {
        return
      }

      const port = event.ports[0]

      if (message.kind === "port" && port) {
        // Removal is the guard's job, not {once}'s: an unrelated message must not consume the
        // listener before the port arrives.
        stop()

        if (state === "listening") {
          resolve(port)
        } else {
          send("return", [port])
        }

        return
      }

      if (message.kind === "withdrawn" && state === "draining") {
        stop()
      }
    }

    win.addEventListener("message", handle)
    signal?.addEventListener("abort", onAbort, { once: true })
    // Listening first, so the port the request releases cannot arrive unheard.
    send("want")
  })
}

/**
 * The slice of Electron's `ipcRenderer` the preload relay touches.
 */
export type PortIpcRendererLike = {
  on(channel: string, listener: (event: { ports: readonly unknown[] }) => void): unknown
  removeListener(channel: string, listener: (event: { ports: readonly unknown[] }) => void): unknown
}

/**
 * Preload end of the hand-off: relays the ports arriving on the IPC channel `type` into the page,
 * one for each {@link receivePort} that asks. A port that arrives before the page asks waits here,
 * so the page may start listening late. `ipcRenderer` is a parameter (not a global) so the preload
 * stays the only module that imports Electron. Aborting `signal` stops the relay and drops the
 * ports it holds.
 *
 * The port is posted to the window's own origin, so a page that has navigated elsewhere never
 * receives it. Pages with an opaque origin (`file://`, whose origin is `"null"`) can't be addressed
 * by origin and fall back to `"*"`; `targetOrigin` overrides both. `target` replaces the global
 * `window`.
 */
export function relayPort(
  ipcRenderer: PortIpcRendererLike,
  type: string,
  options: { signal?: AbortSignal; target?: MessageWindowLike; targetOrigin?: string } = {}
): void {
  const { signal } = options
  const win = options.target ?? defaultWindow("relayPort")

  if (signal?.aborted) {
    return
  }

  // Ports no receiver asked for yet, and requests no port has answered yet, oldest first. `seen`
  // holds every id this relay took a request from, so a repeated `want` reserves nothing more.
  const held: Array<readonly unknown[]> = []
  const waiting: string[] = []
  const seen = new Set<string>()

  const post = (message: HandOffMessage, ports?: readonly unknown[]): void => {
    win.postMessage(message, options.targetOrigin ?? originOf(win), ports)
  }
  const give = (ports: readonly unknown[]): void => {
    const id = waiting.shift()

    if (id === undefined) {
      held.push(ports)
    } else {
      post({ id, kind: "port", type }, ports)
    }
  }
  const relay = (event: { ports: readonly unknown[] }): void => {
    give(event.ports)
  }
  // What the relay does with each message a receiver sends. The relay's own kinds need nothing.
  const handlers: Partial<
    Record<HandOffMessage["kind"], (id: string, ports: readonly unknown[]) => void>
  > = {
    return: (_id, ports) => {
      give(ports)
    },
    want: (id) => {
      if (seen.has(id)) {
        return
      }

      seen.add(id)
      const ports = held.shift()

      if (ports) {
        post({ id, kind: "port", type }, ports)
      } else {
        waiting.push(id)
      }
    },
    withdraw: (id) => {
      const index = waiting.indexOf(id)

      if (index !== -1) {
        waiting.splice(index, 1)
      }

      post({ id, kind: "withdrawn", type })
    },
  }
  const onMessage = (event: PortMessageEvent): void => {
    const message = event.source === win ? parseHandOff(event.data, type) : undefined

    if (message && "id" in message) {
      handlers[message.kind]?.(message.id, event.ports)
    }
  }

  ipcRenderer.on(type, relay)
  win.addEventListener("message", onMessage)
  signal?.addEventListener(
    "abort",
    () => {
      ipcRenderer.removeListener(type, relay)
      win.removeEventListener("message", onMessage)
      held.splice(0)
    },
    { once: true }
  )
  post({ kind: "ready", type })
}

// Only the hand-off's own messages on `type` pass: anything else on the window is another script's.
function parseHandOff(data: unknown, type: string): HandOffMessage | undefined {
  if (!isRecord(data) || data.type !== type) {
    return undefined
  }

  if (data.kind === "ready") {
    return { kind: "ready", type }
  }

  return ADDRESSED_KINDS.has(data.kind) && typeof data.id === "string"
    ? { id: data.id, kind: data.kind as Exclude<HandOffMessage["kind"], "ready">, type }
    : undefined
}

function originOf(win: MessageWindowLike): string {
  const origin = win.location?.origin
  return origin && origin !== "null" ? origin : "*"
}

/**
 * The slice of a `BrowserWindow` that {@link sendPort} touches.
 */
export type PortWindowLike = {
  webContents: {
    getURL(): string
    isLoading(): boolean
    once(event: "did-stop-loading", listener: () => void): unknown
    postMessage(channel: string, message: unknown, transfer?: unknown[]): void
  }
}

/**
 * Main-process end of the hand-off: ships one end of a `MessageChannelMain` to a window once the
 * page can receive it. If the page has stopped loading, the port posts immediately. Otherwise it
 * posts on `did-stop-loading`, the event that turns `isLoading()` false. Electron resolves
 * `loadURL()` on `did-finish-load`, while `isLoading()` is still true, so waiting for
 * `did-finish-load` after an awaited `loadURL()` would wait for an event that already fired.
 *
 * A transferred port is spent, so a reload needs a fresh `MessageChannelMain` and another
 * `sendPort` call (from your own `did-finish-load` handler). A _failed_ navigation
 * (`did-fail-load`) also leaves `isLoading()` false, so the port may post to a page that never
 * arrived and is then spent — treat navigation failure as a reason to rebuild the channel too.
 * Window lifecycle stays the caller's business — pair this with `win.on("closed", () =>
 * close(...))` on the `connect` session serving the other end.
 */
export function sendPort(win: PortWindowLike, port: MainPortLike, type: string): void {
  const { webContents } = win

  if (!webContents.isLoading() && webContents.getURL() !== "") {
    webContents.postMessage(type, null, [port])
    return
  }

  webContents.once("did-stop-loading", () => {
    webContents.postMessage(type, null, [port])
  })
}
