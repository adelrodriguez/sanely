import { expect } from "vitest"
import { Panic, type PanicCode, UnhandledException } from "#errors.ts"

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * Runs synchronous work for `ms` milliseconds of real time. No timer can fire meanwhile, so a
 * deadline can pass while its timer is still pending, as when a timer runs late.
 */
export function blockEventLoop(ms: number): void {
  const end = performance.now() + ms

  while (performance.now() < end) {
    // Busy-wait: the point is to keep the event loop from running timers.
  }
}

export function expectPanic(error: unknown, code: PanicCode) {
  expect(error).toBeInstanceOf(Panic)
  expect((error as Panic).code).toBe(code)
}

export function expectUnhandled(result: unknown, cause?: unknown) {
  expect(result).toBeInstanceOf(UnhandledException)
  expect((result as UnhandledException).cause).toBe(cause)
}

let blackhole: unknown

export function consume<T>(value: T) {
  blackhole = value
  return blackhole as T
}
