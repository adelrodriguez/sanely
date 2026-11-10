import { InvalidPayloadError } from "./errors"
import { Fault, isReservedKey } from "./fault"
import {
  collectPayloadFields,
  definePayloadField,
  MAX_CAUSE_DEPTH,
  RESERVED_FAULT_KEYS,
  type SerializableCause,
  type SerializableFault,
} from "./wire"

export type FaultResolver = (tag: string, payload: Record<string, unknown>) => Fault | undefined

// Prefix applied (repeatedly, until unique) to payload keys that would
// collide with reserved Fault keys during deserialization.
const PAYLOAD_PREFIX = "__payload_"

type PreparedPayload = {
  collisionPayload: Record<string, unknown>
  constructorPayload: Record<string, unknown>
}

class DeserializedFault extends Fault {
  // Widens Fault's protected constructor to public.
  public constructor(tag: string) {
    super(tag)
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

function extractPayloadFields(json: SerializableFault): Record<string, unknown> {
  // Exclude only envelope keys here (not the full reserved rule): a wire key
  // that shadows a Fault method must be renamed by preparePayload, not dropped.
  return collectPayloadFields(json, (key) => RESERVED_FAULT_KEYS.has(key))
}

function preparePayload(payload: Record<string, unknown>): PreparedPayload {
  const collisionPayload: Record<string, unknown> = {}
  const constructorPayload: Record<string, unknown> = {}
  const rawKeys = new Set(Object.keys(payload))
  const assignedKeys = new Set<string>()

  for (const [key, value] of Object.entries(payload)) {
    let targetKey = key

    while (
      isReservedKey(targetKey)
      || assignedKeys.has(targetKey)
      || (targetKey !== key && rawKeys.has(targetKey))
    ) {
      targetKey = `${PAYLOAD_PREFIX}${targetKey}`
    }

    assignedKeys.add(targetKey)

    if (targetKey === key) {
      definePayloadField(constructorPayload, key, value)
    } else {
      definePayloadField(collisionPayload, targetKey, value)
    }
  }

  return { collisionPayload, constructorPayload }
}

function restorePayloadFields(fault: Fault, payload: Record<string, unknown>): void {
  const target = fault as unknown as Record<string, unknown>

  for (const [key, value] of Object.entries(payload)) {
    definePayloadField(target, key, value)
  }
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
  if (json.stack !== undefined) target.stack = json.stack
}

// Revives an envelope that assertSerializableFault already checked, causes included.
function reviveFault(json: SerializableFault, resolveFault?: FaultResolver): Fault {
  const payload = preparePayload(extractPayloadFields(json))
  const resolvedFault = resolveFault?.(json._tag, payload.constructorPayload)
  const fault = resolvedFault ?? new DeserializedFault(json._tag)

  // A resolved constructor already applied constructorPayload; the generic
  // fallback needs both buckets restored directly.
  if (!resolvedFault) {
    restorePayloadFields(fault, payload.constructorPayload)
  }
  restorePayloadFields(fault, payload.collisionPayload)
  restoreDeserializedFields(fault, json)

  if (json.cause !== undefined) {
    // Intentionally assign cause directly instead of withCause().
    // Serialized stacks already contain any prior "Caused by:" enhancement.
    fault.cause = deserializeCause(json.cause, resolveFault)
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
