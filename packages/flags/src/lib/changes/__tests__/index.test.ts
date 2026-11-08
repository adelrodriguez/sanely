import { describe, expect, test, vi } from "vitest"
import { type ChangeListener, createChangeBroadcaster } from "#lib/changes/index.ts"

function createProvider() {
  let notify: ChangeListener | undefined
  const detach = vi.fn(() => null)
  const subscribe = vi.fn((listener: ChangeListener) => {
    notify = listener
    return detach
  })
  return {
    detach,
    notify(keys?: readonly string[]) {
      notify?.(keys)
    },
    subscribe,
  }
}

describe("createChangeBroadcaster", () => {
  test("attaches on the first listener and detaches when the last listener leaves", () => {
    const provider = createProvider()
    const broadcaster = createChangeBroadcaster(provider.subscribe)

    expect(provider.subscribe).not.toHaveBeenCalled()
    const first = broadcaster.subscribe(() => null)
    const second = broadcaster.subscribe(() => null)
    expect(provider.subscribe).toHaveBeenCalledTimes(1)

    first()
    expect(provider.detach).not.toHaveBeenCalled()
    second()
    expect(provider.detach).toHaveBeenCalledTimes(1)

    broadcaster.subscribe(() => null)
    expect(provider.subscribe).toHaveBeenCalledTimes(2)
  })

  test("makes unsubscribe idempotent", () => {
    const provider = createProvider()
    const broadcaster = createChangeBroadcaster(provider.subscribe)
    const first = broadcaster.subscribe(() => null)
    broadcaster.subscribe(() => null)

    first()
    first()

    expect(provider.detach).not.toHaveBeenCalled()
  })

  test("keeps one function subscribed twice until both subscriptions leave", () => {
    const provider = createProvider()
    const broadcaster = createChangeBroadcaster(provider.subscribe)
    const listener = vi.fn()
    const first = broadcaster.subscribe(listener)
    const second = broadcaster.subscribe(listener)

    first()
    provider.notify(["beta-access"])
    expect(listener).toHaveBeenCalledTimes(1)
    second()
    expect(provider.detach).toHaveBeenCalledTimes(1)
  })

  test("notifies every listener synchronously in subscription order", () => {
    const provider = createProvider()
    const broadcaster = createChangeBroadcaster(provider.subscribe)
    const calls: string[] = []
    broadcaster.subscribe((keys) => calls.push(`first:${String(keys)}`))
    broadcaster.subscribe((keys) => calls.push(`second:${String(keys)}`))

    provider.notify(["beta-access"])
    provider.notify()

    expect(calls).toEqual([
      "first:beta-access",
      "second:beta-access",
      "first:undefined",
      "second:undefined",
    ])
  })

  test("delivers a notification sent synchronously during the attach", () => {
    const broadcaster = createChangeBroadcaster((notify) => {
      notify(["beta-access"])
      return () => null
    })
    const listener = vi.fn()

    broadcaster.subscribe(listener)

    expect(listener).toHaveBeenCalledWith(["beta-access"])
  })

  test("stays detached when subscribe throws and lets the next listener retry", () => {
    const detach = vi.fn(() => null)
    const subscribe = vi
      .fn<(notify: ChangeListener) => () => void>()
      .mockImplementationOnce(() => {
        throw new Error("subscribe failed")
      })
      .mockImplementation(() => detach)
    const broadcaster = createChangeBroadcaster(subscribe)
    const failed = vi.fn()

    expect(() => broadcaster.subscribe(failed)).toThrow("subscribe failed")
    const unsubscribe = broadcaster.subscribe(() => null)

    expect(subscribe).toHaveBeenCalledTimes(2)
    unsubscribe()
    expect(detach).toHaveBeenCalledTimes(1)
  })
})
