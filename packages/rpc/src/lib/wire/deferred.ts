import type { Wire } from "./types"

/**
 * A `Wire` over a wire that hasn't arrived yet: outbound data buffers, the listener attaches on
 * arrival, and unsubscribing before arrival detaches permanently and drops the buffer — so a
 * `close` that wins the race leaves a late wire untouched and keeps no payload. `withdraw` takes
 * one buffered entry back before it is sent, so a request whose caller gave up (timed out, aborted)
 * while the wire was pending is never sent, and its payload is released at once. A rejected promise
 * reports through `onReject` (connect closes with it); the buffered data is dropped with the
 * connection, which is what the caller's pending-call rejections already communicate.
 */
export function deferWire(
  pending: Promise<Wire>,
  onReject: (reason: unknown) => void
): { wire: Wire; withdraw: (data: unknown) => boolean } {
  let inner: Wire | undefined
  let listener: ((data: unknown) => void) | undefined
  let innerUnsubscribe: (() => void) | undefined = undefined
  let detached = false
  const outbox: unknown[] = []

  const adopt = async (): Promise<void> => {
    const wire = await pending

    if (detached) {
      return
    }

    inner = wire

    if (listener) {
      innerUnsubscribe = subscribe(wire, listener)
    }

    for (const data of outbox.splice(0)) {
      wire.send(data)
    }
  }

  adopt().catch((error: unknown) => {
    onReject(error)
  })

  return {
    wire: {
      onMessage: (incoming) => {
        listener = incoming

        if (inner) {
          innerUnsubscribe = subscribe(inner, incoming)
        }

        return () => {
          detached = true
          // A detached wire never flushes, so nothing in the buffer can be sent.
          outbox.splice(0)

          if (typeof innerUnsubscribe === "function") {
            innerUnsubscribe()
          }
        }
      },
      send: (data) => {
        if (inner) {
          inner.send(data)
        } else {
          outbox.push(data)
        }
      },
    },
    // True when `data` was still buffered: it never reached the wire, and now it never will.
    withdraw: (data) => {
      const index = outbox.indexOf(data)

      if (index === -1) {
        return false
      }

      outbox.splice(index, 1)
      return true
    },
  }
}

// Normalizes Wire.onMessage's void-or-unsubscribe return to something storable.
export function subscribe(wire: Wire, listener: (data: unknown) => void): (() => void) | undefined {
  const unsubscribe = wire.onMessage(listener)

  return typeof unsubscribe === "function" ? unsubscribe : undefined
}
