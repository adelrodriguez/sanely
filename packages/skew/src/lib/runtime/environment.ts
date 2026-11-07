export type TimerHandle = number | ReturnType<typeof globalThis.setTimeout>

export type RuntimeEventType = "online" | "pageshow" | "visibilitychange"

export interface RuntimeEvent {
  readonly persisted?: boolean
}

export interface RuntimeStorage {
  getItem(key: string): string | null
  removeItem(key: string): void
  setItem(key: string, value: string): void
}

export interface RuntimeEnvironment {
  addEventListener(type: RuntimeEventType, listener: (event: RuntimeEvent) => void): void
  clearInterval(handle: TimerHandle): void
  clearTimeout(handle: TimerHandle): void
  isVisible(): boolean
  now(): number
  reload(): void
  removeEventListener(type: RuntimeEventType, listener: (event: RuntimeEvent) => void): void
  setInterval(callback: () => void, milliseconds: number): TimerHandle
  setTimeout(callback: () => void, milliseconds: number): TimerHandle
  readonly storage: RuntimeStorage | null
}

interface BrowserGlobals {
  addEventListener?: (type: RuntimeEventType, listener: (event: RuntimeEvent) => void) => void
  readonly document?: { readonly visibilityState?: string }
  readonly location?: { reload(): void }
  removeEventListener?: (type: RuntimeEventType, listener: (event: RuntimeEvent) => void) => void
  readonly sessionStorage?: RuntimeStorage
}

export function createBrowserEnvironment(): RuntimeEnvironment {
  const browser: BrowserGlobals = globalThis

  return {
    addEventListener: (type, listener) => {
      browser.addEventListener?.(type, listener)
    },
    clearInterval: (handle) => {
      globalThis.clearInterval(handle)
    },
    clearTimeout: (handle) => {
      globalThis.clearTimeout(handle)
    },
    isVisible: () => browser.document?.visibilityState !== "hidden",
    now: () => Date.now(),
    reload: () => {
      browser.location?.reload()
    },
    removeEventListener: (type, listener) => {
      browser.removeEventListener?.(type, listener)
    },
    setInterval: (callback, milliseconds) => globalThis.setInterval(callback, milliseconds),
    setTimeout: (callback, milliseconds) => globalThis.setTimeout(callback, milliseconds),
    storage: readSessionStorage(browser),
  }
}

function readSessionStorage(browser: BrowserGlobals): RuntimeStorage | null {
  try {
    return browser.sessionStorage ?? null
  } catch {
    return null
  }
}
