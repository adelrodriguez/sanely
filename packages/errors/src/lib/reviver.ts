import { InvalidPayloadError } from "./errors"
import { Fault, restoreStackBase } from "./fault"
import {
  MAX_CAUSE_DEPTH,
  type SerializableCause,
  type SerializableFault,
  type SerializableValue,
} from "./wire"

export type FaultResolver = (
  tag: string,
  fields: Record<string, SerializableValue>
) => Fault | undefined

class DeserializedFault extends Fault {
  // Widens Fault's protected constructor to public.
  public constructor(tag: string, fields: Record<string, SerializableValue>) {
    super(tag, fields)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string"
}

// Prefixes an issue below the head with the number of cause edges above it.
function atDepth(depth: number, issue: string): string {
  return depth === 0 ? issue : `cause at depth ${depth}: ${issue}`
}

// Returns why a value is not a SerializableFault, or undefined when it is one.
// `depth` counts the cause edges between the head and this envelope.
function findFaultIssue(value: unknown, depth: number): string | undefined {
  if (!isRecord(value) || value.__fault !== true) return atDepth(depth, "expected __fault: true")
  if (typeof value._tag !== "string") return atDepth(depth, "_tag must be a string")
  if (typeof value.name !== "string") return atDepth(depth, "name must be a string")
  if (!isOptionalString(value.message)) return atDepth(depth, "message must be a string")
  if (!isOptionalString(value.description)) return atDepth(depth, "description must be a string")
  if (!isOptionalString(value.stack)) return atDepth(depth, "stack must be a string")
  if (value.meta !== undefined && (!isRecord(value.meta) || Array.isArray(value.meta))) {
    return atDepth(depth, "meta must be an object")
  }
  if (value.fields !== undefined && (!isRecord(value.fields) || Array.isArray(value.fields))) {
    return atDepth(depth, "fields must be an object")
  }
  if (value.cause === undefined) return undefined

  return findCauseIssue(value.cause, depth + 1)
}

// Each cause kind's check. The Record type fails the type check when
// SerializableCause gains a kind that has no check here.
type CauseIssueFinder = (cause: Record<string, unknown>, depth: number) => string | undefined

const causeIssueFinders: Record<SerializableCause["kind"], CauseIssueFinder> = {
  error(cause, depth): string | undefined {
    if (typeof cause.name !== "string") return atDepth(depth, "name must be a string")
    if (typeof cause.message !== "string") return atDepth(depth, "message must be a string")
    if (!isOptionalString(cause.stack)) return atDepth(depth, "stack must be a string")
    if (cause.cause === undefined) return undefined

    return findCauseIssue(cause.cause, depth + 1)
  },
  fault(cause, depth) {
    return findFaultIssue(cause.value, depth)
  },
  thrown(): string | undefined {
    return undefined
  },
}

function isCauseKind(kind: unknown): kind is SerializableCause["kind"] {
  return typeof kind === "string" && Object.hasOwn(causeIssueFinders, kind)
}

// `depth` counts the cause edges from the head to this cause, starting at 1.
// The serializer never writes more than MAX_CAUSE_DEPTH of them.
function findCauseIssue(cause: unknown, depth: number): string | undefined {
  if (depth > MAX_CAUSE_DEPTH) {
    return atDepth(depth, `exceeds the limit of ${MAX_CAUSE_DEPTH} nested causes`)
  }
  if (!isRecord(cause) || !isCauseKind(cause.kind)) {
    return atDepth(depth, "kind must be fault, error, or thrown")
  }

  return causeIssueFinders[cause.kind](cause, depth)
}

export function isSerializableFault(value: unknown): value is SerializableFault {
  return findFaultIssue(value, 0) === undefined
}

function assertSerializableFault(value: unknown): asserts value is SerializableFault {
  const issue = findFaultIssue(value, 0)

  if (issue !== undefined) {
    throw new InvalidPayloadError({ reason: issue })
  }
}

function createDeserializedError(name: string, message: string, stack?: string): Error {
  const error = new Error(message)
  error.name = name
  error.stack = stack
  return error
}

function deserializeCause(cause: SerializableCause, resolveFault?: FaultResolver): unknown {
  switch (cause.kind) {
    case "fault":
      return reviveFault(cause.value, resolveFault)
    case "error": {
      const error = createDeserializedError(cause.name, cause.message, cause.stack)
      if (cause.cause !== undefined) {
        error.cause = deserializeCause(cause.cause, resolveFault)
      }
      return error
    }
    case "thrown":
      return cause.value
  }
}

function restoreDeserializedFields(fault: Fault, json: SerializableFault): void {
  const target = fault
  target.name = json.name

  if (json.message !== undefined) target.message = json.message
  if (json.description !== undefined) target.description = json.description
  if (json.meta !== undefined) target.meta = json.meta
}

// Revives an envelope that assertSerializableFault already checked, causes included.
function reviveFault(json: SerializableFault, resolveFault?: FaultResolver): Fault {
  const fields = json.fields ?? {}
  const fault = resolveFault?.(json._tag, fields) ?? new DeserializedFault(json._tag, fields)
  restoreDeserializedFields(fault, json)

  if (json.cause !== undefined) fault.cause = deserializeCause(json.cause, resolveFault)

  // A serialized stack already holds its cause block, so revival keeps it as it was.
  if (json.stack !== undefined) {
    fault.stack = json.stack
    restoreStackBase(fault)
  }

  return fault
}

export function deserializeFault(value: unknown, resolveFault?: FaultResolver): Fault {
  assertSerializableFault(value)
  return reviveFault(value, resolveFault)
}

export function fromSerializable(value: unknown): Fault {
  return deserializeFault(value)
}
