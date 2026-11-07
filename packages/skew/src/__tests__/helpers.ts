import type {
  RuntimeEnvironment,
  RuntimeEvent,
  RuntimeEventType,
  RuntimeStorage,
  TimerHandle,
} from "#lib/runtime/environment.ts"

export class MemoryStorage implements RuntimeStorage {
  readonly #values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.#values.get(key) ?? null
  }

  removeItem(key: string): void {
    this.#values.delete(key)
  }

  setItem(key: string, value: string): void {
    this.#values.set(key, value)
  }
}

export class FakeEnvironment implements RuntimeEnvironment {
  readonly #intervals = new Map<TimerHandle, { callback: () => void; delay: number }>()
  readonly #listeners = new Map<RuntimeEventType, Set<(event: RuntimeEvent) => void>>()
  readonly #timeouts = new Map<TimerHandle, { callback: () => void; delay: number }>()
  #nextInterval = 1
  #nextTimeout = 1
  #now = 0
  #visible = true
  intervalStarts = 0
  reloadCalls = 0
  readonly storage: RuntimeStorage | null

  constructor(storage: RuntimeStorage | null = null) {
    this.storage = storage
  }

  addEventListener(type: RuntimeEventType, listener: (event: RuntimeEvent) => void): void {
    const listeners = this.#listeners.get(type) ?? new Set()
    listeners.add(listener)
    this.#listeners.set(type, listeners)
  }

  clearInterval(handle: TimerHandle): void {
    this.#intervals.delete(handle)
  }

  clearTimeout(handle: TimerHandle): void {
    this.#timeouts.delete(handle)
  }

  fire(type: RuntimeEventType, event: RuntimeEvent = {}): void {
    for (const listener of this.#listeners.get(type) ?? []) {
      listener(event)
    }
  }

  fireIntervals(): void {
    for (const { callback } of this.#intervals.values()) {
      callback()
    }
  }

  fireTimeouts(): void {
    const timeouts = [...this.#timeouts.values()]
    this.#timeouts.clear()
    for (const { callback } of timeouts) {
      callback()
    }
  }

  get intervalDelays(): number[] {
    return [...this.#intervals.values()].map(({ delay }) => delay)
  }

  isVisible(): boolean {
    return this.#visible
  }

  listenerCount(type: RuntimeEventType): number {
    return this.#listeners.get(type)?.size ?? 0
  }

  now(): number {
    return this.#now
  }

  reload(): void {
    this.reloadCalls += 1
  }

  removeEventListener(type: RuntimeEventType, listener: (event: RuntimeEvent) => void): void {
    this.#listeners.get(type)?.delete(listener)
  }

  setInterval(callback: () => void, delay: number): TimerHandle {
    this.intervalStarts += 1
    const handle = this.#nextInterval
    this.#nextInterval += 1
    this.#intervals.set(handle, { callback, delay })
    return handle
  }

  setTimeout(callback: () => void, delay: number): TimerHandle {
    const handle = this.#nextTimeout
    this.#nextTimeout += 1
    this.#timeouts.set(handle, { callback, delay })
    return handle
  }

  setVisible(visible: boolean): void {
    this.#visible = visible
  }

  setNow(now: number): void {
    this.#now = now
  }

  get timeoutDelays(): number[] {
    return [...this.#timeouts.values()].map(({ delay }) => delay)
  }
}
