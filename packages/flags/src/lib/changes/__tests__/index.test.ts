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
    const broadcaster = createChangeBroadcaster(provider.subscribe, () => null)

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
    const broadcaster = createChangeBroadcaster(provider.subscribe, () => null)
    const first = broadcaster.subscribe(() => null)
    broadcaster.subscribe(() => null)

    first()
    first()

    expect(provider.detach).not.toHaveBeenCalled()
  })

  test("keeps one function subscribed twice until both subscriptions leave", () => {
    const provider = createProvider()
    const broadcaster = createChangeBroadcaster(provider.subscribe, () => null)
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
    const broadcaster = createChangeBroadcaster(provider.subscribe, () => null)
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
    const broadcaster = createChangeBroadcaster(
      (notify) => {
        notify(["beta-access"])
        return () => null
      },
      () => null
    )
    const listener = vi.fn()

    broadcaster.subscribe(listener)

    expect(listener).toHaveBeenCalledWith(["beta-access"])
  })

  test("keeps a listener when subscribe throws and delivers changes after a retry", () => {
    let notify: ChangeListener | undefined
    const detach = vi.fn(() => null)
    const subscribe = vi
      .fn<(listener: ChangeListener) => () => void>()
      .mockImplementationOnce(() => {
        throw new Error("subscribe failed")
      })
      .mockImplementation((listener) => {
        notify = listener
        return detach
      })
    const onAttachError = vi.fn()
    const broadcaster = createChangeBroadcaster(subscribe, onAttachError)
    const early = vi.fn()

    const unsubscribeEarly = broadcaster.subscribe(early)
    expect(onAttachError).toHaveBeenCalledWith(new Error("subscribe failed"))

    broadcaster.attach()
    expect(subscribe).toHaveBeenCalledTimes(2)
    broadcaster.attach()
    expect(subscribe).toHaveBeenCalledTimes(2)

    notify?.(["beta-access"])
    expect(early).toHaveBeenCalledWith(["beta-access"])

    unsubscribeEarly()
    expect(detach).toHaveBeenCalledTimes(1)
  })

  test("does not attach without listeners", () => {
    const subscribe = vi.fn(() => () => null)
    const broadcaster = createChangeBroadcaster(subscribe, () => null)

    broadcaster.attach()

    expect(subscribe).not.toHaveBeenCalled()
  })
})
