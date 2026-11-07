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
  // The wire after it arrived, and the wire that takes sends directly once the buffer is empty.
  let arrived: Wire | undefined
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

    arrived = wire

    if (listener) {
      innerUnsubscribe = subscribe(wire, listener)
    }

    // Send one entry at a time. A send can end another call or close the session, so each waiting
    // entry stays in the buffer, where `withdraw` and a detach can still reach it. A detach empties
    // the buffer, which ends the loop. Sends that happen during the flush join the end of the
    // buffer, so frames keep their order.
    while (outbox.length > 0) {
      wire.send(outbox.shift())
    }

    inner = wire
  }

  adopt().catch((error: unknown) => {
    onReject(error)
  })

  return {
    wire: {
      onMessage: (incoming) => {
        listener = incoming

        if (arrived) {
          innerUnsubscribe = subscribe(arrived, incoming)
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
