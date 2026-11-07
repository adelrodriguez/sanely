import { Fault } from "./fault"

// Each class declares its instance _tag as its static literal tag. The declaration is
// type-only. It lets matchTag and matchTags narrow a handler to the error class.

export class ReservedFieldError extends Fault {
  static readonly _tag = "ReservedFieldError"
  declare readonly _tag: typeof ReservedFieldError._tag
  readonly field: string

  constructor(args: { field: string }) {
    super(ReservedFieldError._tag, `Reserved field key: ${args.field}`)
    this.field = args.field
  }
}

export class RegistryTagMismatchError extends Fault {
  static readonly _tag = "RegistryTagMismatchError"
  declare readonly _tag: typeof RegistryTagMismatchError._tag
  readonly ctorTag: string
  readonly registryKey: string

  constructor(args: { registryKey: string; ctorTag: string }) {
    super(
      RegistryTagMismatchError._tag,
      `Registry key '${args.registryKey}' does not match constructor tag '${args.ctorTag}'.`
    )
    this.registryKey = args.registryKey
    this.ctorTag = args.ctorTag
  }
}

export class RegistryMergeConflictError extends Fault {
  static readonly _tag = "RegistryMergeConflictError"
  declare readonly _tag: typeof RegistryMergeConflictError._tag
  readonly conflictingTag: string

  constructor(args: { conflictingTag: string }) {
    super(
      RegistryMergeConflictError._tag,
      `Registry merge conflict for tag '${args.conflictingTag}'.`
    )
    this.conflictingTag = args.conflictingTag
  }
}

export class InvalidPayloadError extends Fault {
  static readonly _tag = "InvalidPayloadError"
  declare readonly _tag: typeof InvalidPayloadError._tag
  readonly reason: string

  constructor(args: { reason: string }) {
    super(InvalidPayloadError._tag, `Invalid fault payload: ${args.reason}`)
    this.reason = args.reason
  }
}
