import { describe, expect, test, vi } from "vitest"
import * as z from "zod"
import {
  domPort,
  mainPort,
  nodePort,
  receivePort,
  relayPort,
  sendPort,
  type DomPortLike,
  type MainPortLike,
  type MessageWindowLike,
  type PortIpcRendererLike,
  type NodePortLike,
} from "#lib/adapters/message-port.ts"
import { createClient } from "#lib/client/index.ts"
import { defineContract, channel } from "#lib/core/contract.ts"
import { SetupError } from "#lib/core/setup-error.ts"
import { createRouter } from "#lib/server/router.ts"
import { connect } from "#lib/wire/connect.ts"

type Listener = (event: { data: unknown }) => void

// One end MessagePortMain-flavored, the other DOM-flavored — the exact pairing of the Electron
// main ↔ renderer hand-off. Messages are structured-cloned, and both ends buffer until start(),
// as the real ports do.
function createPortPair(): { main: MainPortLike; dom: DomPortLike } {
  const buffers: [unknown[], unknown[]] = [[], []]
  const listeners: [Listener[], Listener[]] = [[], []]
  const started: [boolean, boolean] = [false, false]

  const deliver = (side: 0 | 1, data: unknown): void => {
    if (!started[side] || listeners[side].length === 0) {
      buffers[side].push(data)
      return
    }

    for (const listener of listeners[side]) {
      queueMicrotask(() => {
        listener({ data })
      })
    }
  }

  const start = (side: 0 | 1): void => {
    started[side] = true

    for (const data of buffers[side].splice(0)) {
      deliver(side, data)
    }
  }

  return {
    dom: {
      addEventListener: (_type, listener) => {
        listeners[1].push(listener)
      },
      postMessage: (message) => {
        deliver(0, structuredClone(message))
      },
      removeEventListener: (_type, listener) => {
        listeners[1] = listeners[1].filter((entry) => entry !== listener)
      },
      start: () => {
        start(1)
      },
    },
    main: {
      on: (_event, listener) => {
        listeners[0].push(listener)
      },
      postMessage: (message) => {
        deliver(1, structuredClone(message))
      },
      removeListener: (_event, listener) => {
        listeners[0] = listeners[0].filter((entry) => entry !== listener)
      },
      start: () => {
        start(0)
      },
    },
  }
}

const contract = defineContract({
  math: {
    add: channel({ input: z.object({ a: z.number(), b: z.number() }), output: z.number() }),
  },
})

describe("mainPort / domPort", () => {
  test("a full stack round-trips across the flavor boundary", async () => {
    const { main, dom } = createPortPair()

    const router = createRouter(contract, {
      "math.add": ({ input: { a, b } }) => a + b,
    })
    connect(mainPort(main), { router })

    const client = connect(domPort(dom))
    const api = createClient(contract, client.transport)

    await expect(api.math.add({ a: 2, b: 3 })).resolves.toBe(5)
  })

  test("unsubscribing detaches the listener from both flavors", async () => {
    const { main, dom } = createPortPair()

    const mainSeen: unknown[] = []
    const domSeen: unknown[] = []

    const stopMain = mainPort(main).onMessage((data) => {
      mainSeen.push(data)
    })
    const stopDom = domPort(dom).onMessage((data) => {
      domSeen.push(data)
    })

    if (typeof stopMain === "function") {
      stopMain()
    }
    if (typeof stopDom === "function") {
      stopDom()
    }

    // oxlint-disable-next-line require-post-message-target-origin -- MessagePort.postMessage takes a transfer list, not a targetOrigin
    dom.postMessage("to main")
    // oxlint-disable-next-line require-post-message-target-origin -- MessagePortMain.postMessage takes a transfer list, not a targetOrigin
    main.postMessage("to dom")
    // The pair delivers in a microtask; wait for it, or a listener that stayed attached would
    // still look detached.
    await Promise.resolve()

    expect(mainSeen).toEqual([])
    expect(domSeen).toEqual([])
  })
})

describe("nodePort", () => {
  test("adapts the unwrapped-value emitter shape", () => {
    let handler: ((value: unknown) => void) | undefined
    const sent: unknown[] = []

    const port: NodePortLike = {
      on: (_event, listener) => {
        handler = listener
      },
      postMessage: (value) => {
        sent.push(value)
      },
      removeListener: () => {
        handler = undefined
      },
    }

    const wire = nodePort(port)
    const seen: unknown[] = []
    const stop = wire.onMessage((data) => {
      seen.push(data)
    })

    // Node listeners receive the value directly — no event wrapper to unwrap.
    handler?.({ hello: true })
    wire.send("out")

    expect(seen).toEqual([{ hello: true }])
    expect(sent).toEqual(["out"])

    if (typeof stop === "function") {
      stop()
    }

    expect(handler).toBeUndefined()
  })
})

type WindowMessage = { message: unknown; targetOrigin: string; transfer: readonly unknown[] }

function createFakeWindow(origin?: string): {
  window: MessageWindowLike
  emit: (event: { data: unknown; ports: readonly DomPortLike[]; source: unknown }) => void
  posted: WindowMessage[]
  listenerCount: () => number
} {
  let listeners: Array<
    (event: { data: unknown; ports: readonly DomPortLike[]; source: unknown }) => void
  > = []
  const posted: WindowMessage[] = []

  return {
    emit: (event) => {
      for (const listener of listeners) {
        listener(event)
      }
    },
    listenerCount: () => listeners.length,
    posted,
    window: {
      addEventListener: (_type, listener) => {
        listeners.push(listener)
      },
      ...(origin === undefined ? {} : { location: { origin } }),
      postMessage: (message, targetOrigin, transfer = []) => {
        posted.push({ message, targetOrigin, transfer })
      },
      removeEventListener: (_type, listener) => {
        listeners = listeners.filter((entry) => entry !== listener)
      },
    },
  }
}

// Delivers what the window posted back to its listeners, as the browser does after each task, until
// nothing new is posted. Returns every message that was posted.
function pump(fake: ReturnType<typeof createFakeWindow>): WindowMessage[] {
  const delivered: WindowMessage[] = []

  for (let next = fake.posted.shift(); next; next = fake.posted.shift()) {
    delivered.push(next)
    fake.emit({ data: next.message, ports: next.transfer as DomPortLike[], source: fake.window })
  }

  return delivered
}

// The messages that carried a port to the page, leaving out the page's own requests.
function portPosts(messages: readonly WindowMessage[]): WindowMessage[] {
  return messages.filter(
    ({ message }) => !(typeof message === "object" && message !== null && "want" in message)
  )
}

// What `receivePort` posts when it starts listening.
const REQUEST = { data: { type: "app:port", want: true }, ports: [] }

describe("receivePort", () => {
  test("resolves only for same-window messages of the agreed type carrying a port", async () => {
    const fake = createFakeWindow()
    const { dom } = createPortPair()

    const received = receivePort("app:port", { target: fake.window })

    // An injected script posting from elsewhere must not be able to substitute a port.
    fake.emit({ data: { type: "app:port" }, ports: [dom], source: { not: "the window" } })
    // Same window, wrong type: not ours.
    fake.emit({ data: { type: "other" }, ports: [dom], source: fake.window })
    // Same window, right type, no port: not consumed.
    fake.emit({ data: { type: "app:port" }, ports: [], source: fake.window })

    expect(fake.listenerCount()).toBe(1)

    fake.emit({ data: { type: "app:port" }, ports: [dom], source: fake.window })

    await expect(received).resolves.toBe(dom)
    // The guard controls removal; once resolved the listener is gone.
    expect(fake.listenerCount()).toBe(0)
  })
})

describe("the hand-off with the global window", () => {
  test("receivePort and relayPort use the global window when given no target", async () => {
    const fake = createFakeWindow("https://app.local")
    const { dom } = createPortPair()
    const { deliver, ipc } = createFakeIpc()
    vi.stubGlobal("window", fake.window)

    try {
      relayPort(ipc, "app:port")
      const received = receivePort("app:port")
      deliver([dom])

      expect(portPosts(pump(fake))).toEqual([
        { message: { type: "app:port" }, targetOrigin: "https://app.local", transfer: [dom] },
      ])
      await expect(received).resolves.toBe(dom)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe("the hand-off outside the DOM", () => {
  test.each([
    [
      "receivePort",
      () => {
        void receivePort("app:port")
      },
    ],
    [
      "relayPort",
      () => {
        relayPort(createFakeIpc().ipc, "app:port")
      },
    ],
  ])("%s throws no-window without a target or a global window", (caller, start) => {
    expect(Reflect.get(globalThis, "window")).toBeUndefined()

    const error = (() => {
      try {
        start()
        return null
      } catch (error) {
        return error
      }
    })()

    expect(error).toBeInstanceOf(SetupError)
    expect(error).toMatchObject({
      caller,
      code: "no-window",
      message: `${caller} needs a window; outside the DOM, pass one explicitly`,
    })
  })
})

describe("the relay and the receiver in either order", () => {
  test("a receiver that starts after the port arrived still gets it", async () => {
    const fake = createFakeWindow("https://app.local")
    const { dom } = createPortPair()
    const { deliver, ipc } = createFakeIpc()

    relayPort(ipc, "app:port", { target: fake.window })
    deliver([dom])
    pump(fake)

    // The renderer asks only now, as a lazily loaded module would.
    const received = receivePort("app:port", { target: fake.window })
    pump(fake)

    await expect(received).resolves.toBe(dom)
  })

  test("a receiver that starts first gets the port when it arrives", async () => {
    const fake = createFakeWindow("https://app.local")
    const { dom } = createPortPair()
    const { deliver, ipc } = createFakeIpc()

    relayPort(ipc, "app:port", { target: fake.window })
    const received = receivePort("app:port", { target: fake.window })
    pump(fake)
    deliver([dom])
    pump(fake)

    await expect(received).resolves.toBe(dom)
  })

  test("a receiver that gave up leaves the next port for the next receiver", async () => {
    const fake = createFakeWindow("https://app.local")
    const { dom } = createPortPair()
    const { deliver, ipc } = createFakeIpc()
    const controller = new AbortController()

    relayPort(ipc, "app:port", { target: fake.window })
    const abandoned = receivePort("app:port", { signal: controller.signal, target: fake.window })
    controller.abort("gave up")
    pump(fake)
    deliver([dom])
    pump(fake)

    await expect(abandoned).rejects.toBe("gave up")

    const received = receivePort("app:port", { target: fake.window })
    pump(fake)

    await expect(received).resolves.toBe(dom)
  })

  test("each port goes to one receiver, in the order they asked", async () => {
    const fake = createFakeWindow("https://app.local")
    const first = createPortPair().dom
    const second = createPortPair().dom
    const { deliver, ipc } = createFakeIpc()

    relayPort(ipc, "app:port", { target: fake.window })
    deliver([first])
    deliver([second])
    pump(fake)

    const one = receivePort("app:port", { target: fake.window })
    pump(fake)
    const two = receivePort("app:port", { target: fake.window })
    pump(fake)

    await expect(Promise.all([one, two])).resolves.toEqual([first, second])
  })
})

describe("receivePort with a signal", () => {
  test("rejects with the abort reason and detaches its listener", async () => {
    const fake = createFakeWindow()
    const controller = new AbortController()
    const reason = new Error("gave up")

    const received = receivePort("app:port", { signal: controller.signal, target: fake.window })
    controller.abort(reason)

    await expect(received).rejects.toBe(reason)
    expect(fake.listenerCount()).toBe(0)
  })

  test("rejects immediately for an already-aborted signal", async () => {
    const fake = createFakeWindow()

    await expect(
      receivePort("app:port", { signal: AbortSignal.abort(), target: fake.window })
    ).rejects.toThrow(expect.objectContaining({ name: "AbortError" }) as Error)
    expect(fake.listenerCount()).toBe(0)
  })
})

function createFakeIpc(): {
  ipc: PortIpcRendererLike
  deliver: (ports: readonly unknown[]) => void
} {
  const handlers = new Map<string, (event: { ports: readonly unknown[] }) => void>()

  return {
    deliver: (ports) => handlers.get("app:port")?.({ ports }),
    ipc: {
      on: (channel, listener) => {
        handlers.set(channel, listener)
      },
      removeListener: (channel, listener) => {
        if (handlers.get(channel) === listener) {
          handlers.delete(channel)
        }
      },
    },
  }
}

describe("relayPort", () => {
  test("reposts ports from the IPC channel to the window's own origin", () => {
    const fake = createFakeWindow("https://app.local")
    const { dom } = createPortPair()
    const { deliver, ipc } = createFakeIpc()

    relayPort(ipc, "app:port", { target: fake.window })
    fake.emit({ ...REQUEST, source: fake.window })
    deliver([dom])

    expect(fake.posted).toEqual([
      { message: { type: "app:port" }, targetOrigin: "https://app.local", transfer: [dom] },
    ])
  })

  test("holds a port until the page asks, and ignores requests from other windows", () => {
    const fake = createFakeWindow("https://app.local")
    const { dom } = createPortPair()
    const { deliver, ipc } = createFakeIpc()

    relayPort(ipc, "app:port", { target: fake.window })
    deliver([dom])
    fake.emit({ ...REQUEST, source: { not: "the window" } })
    fake.emit({ data: { type: "other", want: true }, ports: [], source: fake.window })

    expect(fake.posted).toEqual([])

    fake.emit({ ...REQUEST, source: fake.window })

    expect(fake.posted).toEqual([
      { message: { type: "app:port" }, targetOrigin: "https://app.local", transfer: [dom] },
    ])
  })

  test.each([["null"], [undefined]])("falls back to * when the origin is %s", (origin) => {
    const fake = createFakeWindow(origin)
    const { deliver, ipc } = createFakeIpc()

    relayPort(ipc, "app:port", { target: fake.window })
    fake.emit({ ...REQUEST, source: fake.window })
    deliver([])

    expect(fake.posted[0]?.targetOrigin).toBe("*")
  })

  test("lets targetOrigin override the default", () => {
    const fake = createFakeWindow("https://app.local")
    const { deliver, ipc } = createFakeIpc()

    relayPort(ipc, "app:port", { target: fake.window, targetOrigin: "https://other.local" })
    fake.emit({ ...REQUEST, source: fake.window })
    deliver([])

    expect(fake.posted[0]?.targetOrigin).toBe("https://other.local")
  })

  test("relays nothing for an already-aborted signal", () => {
    const fake = createFakeWindow("https://app.local")
    const { deliver, ipc } = createFakeIpc()

    relayPort(ipc, "app:port", { signal: AbortSignal.abort(), target: fake.window })
    fake.emit({ ...REQUEST, source: fake.window })
    deliver([])

    expect(fake.posted).toEqual([])
  })

  test("stops relaying once the signal aborts", () => {
    const fake = createFakeWindow("https://app.local")
    const { deliver, ipc } = createFakeIpc()
    const controller = new AbortController()

    relayPort(ipc, "app:port", { signal: controller.signal, target: fake.window })
    // A port held when the relay stops is dropped, and later requests and ports are ignored.
    deliver([])
    controller.abort()
    fake.emit({ ...REQUEST, source: fake.window })
    deliver([])
    fake.emit({ ...REQUEST, source: fake.window })

    expect(fake.posted).toEqual([])
    expect(fake.listenerCount()).toBe(0)
  })
})

describe("sendPort", () => {
  type Posted = { channel: string; message: unknown; transfer?: unknown[] }

  // Keeps listeners by event name, so a test fires the exact event Electron would.
  function createFakeWebContents(options: { loading: boolean; url: string }): {
    win: Parameters<typeof sendPort>[0]
    posted: Posted[]
    fire: (event: string) => void
  } {
    const posted: Posted[] = []
    const listeners = new Map<string, () => void>()

    return {
      fire: (event) => {
        const listener = listeners.get(event)
        listeners.delete(event)
        listener?.()
      },
      posted,
      win: {
        webContents: {
          getURL: () => options.url,
          isLoading: () => options.loading,
          once: (event, listener) => {
            listeners.set(event, listener)
          },
          postMessage: (channel, message, transfer) => {
            posted.push({ channel, message, transfer })
          },
        },
      },
    }
  }

  test("ships the port once a still-loading page stops loading", () => {
    const { main } = createPortPair()
    const { win, posted, fire } = createFakeWebContents({ loading: true, url: "" })

    sendPort(win, main, "app:port")

    // Nothing moves before the page can receive it.
    expect(posted).toEqual([])

    fire("did-stop-loading")

    expect(posted).toEqual([{ channel: "app:port", message: null, transfer: [main] }])
  })

  test("ships the port after loadURL resolves while the page still reports loading", () => {
    const { main } = createPortPair()
    // Electron fires did-finish-load, resolves loadURL, and only then fires did-stop-loading,
    // which is when isLoading() turns false. A wait for did-finish-load here would never end.
    const { win, posted, fire } = createFakeWebContents({
      loading: true,
      url: "https://app.local/",
    })

    sendPort(win, main, "app:port")
    fire("did-stop-loading")

    expect(posted).toEqual([{ channel: "app:port", message: null, transfer: [main] }])
  })

  test("ships the port immediately when the page has already loaded", () => {
    const { main } = createPortPair()
    // The state after `await win.loadURL(url)`: did-finish-load already fired,
    // so waiting for it again would wait forever.
    const { win, posted } = createFakeWebContents({ loading: false, url: "https://app.local/" })

    sendPort(win, main, "app:port")

    expect(posted).toEqual([{ channel: "app:port", message: null, transfer: [main] }])
  })

  test("waits for the first load when no page has been loaded yet", () => {
    const { main } = createPortPair()
    const { win, posted, fire } = createFakeWebContents({ loading: false, url: "" })

    sendPort(win, main, "app:port")

    expect(posted).toEqual([])

    fire("did-stop-loading")

    expect(posted).toEqual([{ channel: "app:port", message: null, transfer: [main] }])
  })
})
