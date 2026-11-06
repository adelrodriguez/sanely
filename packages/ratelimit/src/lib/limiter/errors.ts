export class StoreError extends Error {
  override readonly name = "StoreError"

  constructor(cause: unknown) {
    super("The rate limit store failed", { cause })
  }
}

export class StoreTimeoutError extends Error {
  override readonly name = "StoreTimeoutError"
  readonly timeout: number

  constructor(timeout: number) {
    super(`The rate limit store did not answer within ${timeout} ms`)
    this.timeout = timeout
  }
}
