const SUPPRESSED_ERROR_MESSAGE = "An error was suppressed during disposal"

const nativeDispose = Reflect.get(Symbol, "dispose")
const nativeAsyncDispose = Reflect.get(Symbol, "asyncDispose")

export const DISPOSE: symbol =
  typeof nativeDispose === "symbol" ? nativeDispose : Symbol.for("Symbol.dispose")
export const ASYNC_DISPOSE: symbol =
  typeof nativeAsyncDispose === "symbol" ? nativeAsyncDispose : Symbol.for("Symbol.asyncDispose")

type SyncDisposer = () => void
type AsyncDisposerFn = () => void | PromiseLike<void>

export type DisposableLike = {
  [DISPOSE](): void
}

export type AsyncDisposableLike = {
  [ASYNC_DISPOSE](): void | PromiseLike<void>
}

export type MaybeDisposable = AsyncDisposableLike | DisposableLike | null | undefined

export interface AsyncDisposer extends AsyncDisposable {
  /**
   * Registers a cleanup callback. Callbacks run in reverse registration order (LIFO) when the
   * disposer is disposed.
   */
  defer(fn: () => void | PromiseLike<void>): void
  /**
   * Tracks a disposable resource and returns it.
   */
  use<T extends AsyncDisposable | Disposable | null | undefined>(value: T): T
  /**
   * Runs all registered teardown in reverse registration order. Equivalent to leaving an `await
   * using` scope.
   */
  dispose(): Promise<void>
}

export function defineDisposeAlias(prototype: { dispose(): void }): void {
  Object.defineProperty(prototype, DISPOSE, {
    configurable: true,
    value(this: { dispose(): void }) {
      this.dispose()
    },
    writable: true,
  })
}

export function defineAsyncDisposeAlias(prototype: { dispose(): Promise<void> }): void {
  Object.defineProperty(prototype, ASYNC_DISPOSE, {
    configurable: true,
    async value(this: { dispose(): Promise<void> }) {
      await this.dispose()
    },
    writable: true,
  })
}

function createSuppressedError(error: unknown, suppressed: unknown): Error {
  if (typeof SuppressedError === "function") {
    return new SuppressedError(error, suppressed, SUPPRESSED_ERROR_MESSAGE)
  }

  const wrapped = new Error(SUPPRESSED_ERROR_MESSAGE) as Error & {
    error: unknown
    suppressed: unknown
  }

  wrapped.name = "SuppressedError"
  wrapped.error = error
  wrapped.suppressed = suppressed

  return wrapped
}

/**
 * A cleanup failure. It wraps the thrown value, so a cleanup that throws `undefined` still counts
 * as a failure.
 */
interface DisposalFailure {
  readonly error: unknown
}

function addFailure(failure: DisposalFailure | undefined, error: unknown) {
  return { error: failure ? createSuppressedError(error, failure.error) : error }
}

function checkCanRegister(disposed: boolean, name: string) {
  if (disposed) {
    throw new ReferenceError(`${name} already disposed`)
  }
}

function resolveAsyncDisposer(
  value: AsyncDisposable | Disposable | MaybeDisposable
): AsyncDisposerFn {
  const asyncCandidate = value as AsyncDisposableLike
  const asyncDisposer = asyncCandidate[ASYNC_DISPOSE]

  if (typeof asyncDisposer === "function") {
    return () => asyncDisposer.call(value)
  }

  const syncCandidate = value as DisposableLike
  const syncDisposer = syncCandidate[DISPOSE]

  if (typeof syncDisposer === "function") {
    return () => {
      syncDisposer.call(value)
    }
  }

  throw new TypeError("Object not disposable")
}

export class InternalDisposableStack implements Disposable {
  #disposed = false
  #stack: SyncDisposer[] = []
  declare [Symbol.dispose]: () => void

  defer(fn: SyncDisposer): void {
    checkCanRegister(this.#disposed, "DisposableStack")
    if (typeof fn !== "function") {
      throw new TypeError(`${String(fn)} is not a function`)
    }
    this.#stack.push(fn)
  }

  dispose(): void {
    this.#disposeAll()
  }

  #disposeAll(): void {
    if (this.#disposed) {
      return
    }

    this.#disposed = true

    let failure: DisposalFailure | undefined
    const stack = this.#stack
    this.#stack = []

    for (const disposer of stack.toReversed()) {
      try {
        disposer()
      } catch (caughtError) {
        failure = addFailure(failure, caughtError)
      }
    }

    if (failure) {
      // oxlint-disable-next-line typescript/only-throw-error -- Preserve raw disposer failures.
      throw failure.error
    }
  }
}
defineDisposeAlias(InternalDisposableStack.prototype)

class AsyncDisposerStack implements AsyncDisposer {
  #disposed = false
  #stack: AsyncDisposerFn[] = []
  declare [Symbol.asyncDispose]: () => Promise<void>

  defer(fn: AsyncDisposerFn): void {
    checkCanRegister(this.#disposed, "AsyncDisposableStack")
    if (typeof fn !== "function") {
      throw new TypeError(`${String(fn)} is not a function`)
    }
    this.#stack.push(fn)
  }

  use<T extends AsyncDisposable | Disposable>(value: T): T
  use(value: null): null
  use(value: undefined): undefined
  use(value: AsyncDisposable | Disposable | null | undefined) {
    if (value === null || value === undefined) {
      return value
    }

    checkCanRegister(this.#disposed, "AsyncDisposableStack")
    this.#stack.push(resolveAsyncDisposer(value))
    return value
  }

  async dispose(): Promise<void> {
    await this.#disposeAllAsync()
  }

  async #disposeAllAsync(): Promise<void> {
    if (this.#disposed) {
      return
    }

    this.#disposed = true

    let failure: DisposalFailure | undefined
    const stack = this.#stack
    this.#stack = []

    for (const disposer of stack.toReversed()) {
      try {
        // Cleanup must remain sequential so LIFO teardown order is preserved.
        // oxlint-disable-next-line no-await-in-loop
        await disposer()
      } catch (caughtError) {
        failure = addFailure(failure, caughtError)
      }
    }

    if (failure) {
      // oxlint-disable-next-line typescript/only-throw-error -- Preserve raw async disposer failures.
      throw failure.error
    }
  }
}
defineAsyncDisposeAlias(AsyncDisposerStack.prototype)

export function disposer(): AsyncDisposer {
  return new AsyncDisposerStack()
}
