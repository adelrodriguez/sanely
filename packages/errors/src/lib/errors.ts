import { Tagged } from "./tagged"

// The package's own errors are tagged faults, defined the same way as an app's faults.

export class RegistryTagMismatchError extends Tagged("RegistryTagMismatchError")<{
  ctorTag: string
  registryKey: string
}>() {
  constructor(fields: { ctorTag: string; registryKey: string }) {
    super(fields)
    this.message = `Registry key '${fields.registryKey}' does not match constructor tag '${fields.ctorTag}'.`
  }
}

export class RegistryMergeConflictError extends Tagged("RegistryMergeConflictError")<{
  conflictingTag: string
}>() {
  constructor(fields: { conflictingTag: string }) {
    super(fields)
    this.message = `Registry merge conflict for tag '${fields.conflictingTag}'.`
  }
}

export class RegistryUnknownTagError extends Tagged("RegistryUnknownTagError")<{ tag: string }>() {
  constructor(fields: { tag: string }) {
    super(fields)
    this.message = `Unknown Fault registry tag '${fields.tag}'.`
  }
}

export class RegistryNotRecognizedError extends Tagged("RegistryNotRecognizedError")() {
  constructor() {
    super()
    this.message = "Expected a registry created by registry() or merge()."
  }
}

export class RegistryConstructorError extends Tagged("RegistryConstructorError")<{
  tag: string
}>() {
  constructor(fields: { tag: string }) {
    super(fields)
    this.message = `The constructor registered for tag '${fields.tag}' did not create a Fault.`
  }
}

export class InvalidPayloadError extends Tagged("InvalidPayloadError")<{ reason: string }>() {
  constructor(fields: { reason: string }) {
    super(fields)
    this.message = `Invalid fault payload: ${fields.reason}`
  }
}
