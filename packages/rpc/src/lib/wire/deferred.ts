import type { Wire } from "./types"

/**
 * What `connect` sends through. A send that fails reports to its own `fail`, whether the wire
 * throws at once or later, when a queued send reaches a wire that arrived. So one payload the wire
 * cannot carry fails only its own call, never the session.
 */
export type Outbound = {
  onMessage: Wire["onMessage"]
  send: (data: unknown, fail: (error: unknown) => void) => void
}

type Queued = { data: unknown; fail: (error: unknown) => void }

/**
 * An `Outbound` over a wire that is already here.
 */
export function directWire(wire: Wire): Outbound {
  return {
    onMessage: (listener) => wire.onMessage(listener),
    send: (data, fail) => {
      try {
        wire.send(data)
      } catch (error) {
        fail(error)
      }
    },
  }
}

/**
 * An `Outbound` over a wire that hasn't arrived yet: outbound data buffers, the listener attaches
 * on arrival, and unsubscribing before arrival detaches permanently and drops the buffer — so a
 * `close` that wins the race leaves a late wire untouched and keeps no payload. `withdraw` takes
 * one buffered entry back before it is sent, so a request whose caller gave up (timed out, aborted)
 * while the wire was pending is never sent, and its payload is released at once. A rejected promise
 * reports through `onReject` (connect closes with it); the buffered data is dropped with the
 * connection, which is what the caller's pending-call rejections already communicate.
 */
export function deferWire(
  pending: Promise<Wire>,
  onReject: (reason: unknown) => void
): { wire: Outbound; withdraw: (data: unknown) => boolean } {
  // The wire after it arrived, and the wire that takes sends directly once the buffer is empty.
  let arrived: Wire | undefined
  let inner: Outbound | undefined
  let listener: ((data: unknown) => void) | undefined
  let innerUnsubscribe: (() => void) | undefined = undefined
  let detached = false
  const outbox: Queued[] = []

  const adopt = async (): Promise<void> => {
    const wire = await pending

    if (detached) {
      return
    }

    arrived = wire

    if (listener) {
      innerUnsubscribe = subscribe(wire, listener)
    }

    const direct = directWire(wire)

    // Send one entry at a time. A send can end another call or close the session, so each waiting
    // entry stays in the buffer, where `withdraw` and a detach can still reach it. A detach empties
    // the buffer, which ends the loop. Sends that happen during the flush join the end of the
    // buffer, so frames keep their order.
    for (let entry = outbox.shift(); entry; entry = outbox.shift()) {
      direct.send(entry.data, entry.fail)
    }

    inner = direct
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
      send: (data, fail) => {
        if (inner) {
          inner.send(data, fail)
        } else {
          outbox.push({ data, fail })
        }
      },
    },
    // True when `data` was still buffered: it never reached the wire, and now it never will.
    withdraw: (data) => {
      const index = outbox.findIndex((entry) => entry.data === data)

      if (index === -1) {
        return false
      }

      outbox.splice(index, 1)
      return true
    },
  }
}

// Normalizes Wire.onMessage's void-or-unsubscribe return to something storable.
export function subscribe(
  wire: Pick<Wire, "onMessage">,
  listener: (data: unknown) => void
): (() => void) | undefined {
  const unsubscribe = wire.onMessage(listener)

  return typeof unsubscribe === "function" ? unsubscribe : undefined
}
