import { GateTimeoutError } from "./errors"
import { normalizeError } from "./utils"

const noop: () => void = () => null

function abortReason(signal: AbortSignal): Error {
  return normalizeError(signal.reason)
}

export function createEvaluationSignal(
  callerSignal: AbortSignal | undefined,
  timeoutMs?: number
): { cleanup: () => void; signal: AbortSignal } {
  if (timeoutMs === undefined) {
    const signal = callerSignal ?? new AbortController().signal
    return { cleanup: noop, signal }
  }

  const controller = new AbortController()
  let removeCallerListener = noop

  if (callerSignal) {
    const forwardCallerAbort = () => {
      controller.abort(callerSignal.reason)
    }

    if (callerSignal.aborted) {
      forwardCallerAbort()
    } else {
      callerSignal.addEventListener("abort", forwardCallerAbort, { once: true })
      removeCallerListener = () => {
        callerSignal.removeEventListener("abort", forwardCallerAbort)
      }
    }
  }

  const timer = setTimeout(() => {
    controller.abort(new GateTimeoutError(timeoutMs))
  }, timeoutMs)

  return {
    cleanup() {
      removeCallerListener()
      clearTimeout(timer)
    },
    signal: controller.signal,
  }
}

/**
 * The signal for work that several callers share. Each caller joins with its own signal. The shared
 * signal aborts only when every caller that joined has aborted, with the reason of the last one, so
 * one caller's cancellation or deadline never stops the work for the others. `release` detaches the
 * listeners after the work settles.
 *
 * Once the shared signal aborts, `join` has no effect: the work has stopped. Check `signal.aborted`
 * before joining, and start new work when it is true.
 */
export type SharedSignal = {
  join(signal: AbortSignal): void
  release(): void
  signal: AbortSignal
}

export function createSharedSignal(): SharedSignal {
  const controller = new AbortController()
  const releases = new Set<() => void>()
  let active = 0

  return {
    join(signal) {
      if (controller.signal.aborted) {
        return
      }
      if (signal.aborted) {
        if (active === 0) {
          controller.abort(signal.reason)
        }
        return
      }
      active += 1
      const leave = () => {
        releases.delete(release)
        active -= 1
        if (active === 0) {
          controller.abort(signal.reason)
        }
      }
      const release = () => {
        signal.removeEventListener("abort", leave)
      }
      signal.addEventListener("abort", leave, { once: true })
      releases.add(release)
    },
    release() {
      for (const release of releases) {
        release()
      }
      releases.clear()
    },
    signal: controller.signal,
  }
}

export async function raceWithSignal<T>(
  operation: () => T | Promise<T>,
  signal: AbortSignal
): Promise<T> {
  if (signal.aborted) {
    throw abortReason(signal)
  }

  const aborted = Promise.withResolvers<never>()
  const onAbort = () => {
    aborted.reject(abortReason(signal))
  }
  signal.addEventListener("abort", onAbort, { once: true })
  void aborted.promise.catch(() => null)
  const pending = Promise.resolve().then(operation)
  void pending.catch(() => null)

  try {
    return await Promise.race([pending, aborted.promise])
  } finally {
    signal.removeEventListener("abort", onAbort)
  }
}
