export type TargetResolutionErrorReason =
  | "network"
  | "http-status"
  | "not-json"
  | "invalid-json"
  | "unsupported-version"
  | "invalid-shape"

export class TargetResolutionError extends Error {
  override readonly name = "TargetResolutionError"
  readonly reason: TargetResolutionErrorReason

  constructor(reason: TargetResolutionErrorReason, cause?: unknown) {
    super(`Could not resolve target deployment: ${reason}`, { cause })
    this.reason = reason
  }
}
