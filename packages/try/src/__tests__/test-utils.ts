import { expect } from "vitest"
import { Panic, type PanicCode, UnhandledException } from "#errors.ts"

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
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
