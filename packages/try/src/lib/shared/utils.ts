import { InternalDisposableStack } from "#lib/disposal/index.ts"
import { Panic, type PanicCode } from "./errors.ts"

export function assertUnreachable(value: never, code: PanicCode): never {
  throw new Panic(code, { message: `Unreachable case: ${String(value)}` })
}

export function invariant(condition: unknown, error: Error): asserts condition {
  if (!condition) {
    throw error
  }
}

export function checkIsPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === "object" || typeof value === "function")
    && value !== null
    && typeof (value as { then?: unknown }).then === "function"
  )
}

/**
 * Attaches a no-op rejection handler to a promise whose outcome is being discarded, so a later
 * rejection is not reported as unhandled.
 */
export function discardOutcome(promise: PromiseLike<unknown>): void {
  void Promise.resolve(promise).catch((error: unknown) => void error)
}

export async function resolveWithAbort<V, E>(
  signal: AbortSignal,
  promise: PromiseLike<V>,
  createAbortResult: () => E
): Promise<V | E> {
  if (signal.aborted) {
    discardOutcome(promise)
    return createAbortResult()
  }

  using disposer = new InternalDisposableStack()

  // The executor runs synchronously after the aborted check above, so the signal is still live.
  const abortPromise = new Promise<E>((resolve) => {
    const onAbort = () => {
      resolve(createAbortResult())
    }

    signal.addEventListener("abort", onAbort, { once: true })
    disposer.defer(() => {
      signal.removeEventListener("abort", onAbort)
    })
  })

  return await Promise.race([Promise.resolve(promise), abortPromise])
}

/**
 * The longest delay that `setTimeout` keeps. Node.js and browsers store the delay in a signed
 * 32-bit integer and run a longer timer after 1 ms.
 */
const MAX_TIMER_DELAY_MS = 2_147_483_647

/**
 * Calls `callback` once `ms` milliseconds have passed, and returns a function that cancels the
 * call. A delay above the timer limit runs as a chain of shorter timers, so it never ends early.
 */
export function startTimer(callback: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined

  const schedule = (remainingMs: number) => {
    const chunkMs = Math.min(remainingMs, MAX_TIMER_DELAY_MS)

    timer = setTimeout(() => {
      if (remainingMs > chunkMs) {
        schedule(remainingMs - chunkMs)
      } else {
        callback()
      }
    }, chunkMs)
  }

  schedule(ms)

  return () => {
    clearTimeout(timer)
  }
}

export type NonPromise<T> = T extends PromiseLike<unknown> ? never : T
