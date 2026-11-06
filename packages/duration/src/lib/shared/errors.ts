export class InvalidNameError extends Error {
  override readonly name = "InvalidNameError"
  readonly value: string

  constructor(value: string) {
    super(`Expected a non-empty name, received "${value}"`)
    this.value = value
  }
}
