import {
  MAX_CAUSE_DEPTH,
  normalizeThrown,
  type SerializableCause,
  type SerializableFault,
  type SerializableValue,
} from "./wire"

export type FlattenField = "message" | "description"

export type FlattenOptions = {
  field?: FlattenField
  separator?: string
  formatter?: (value: string) => string
}

// The part of a fault's stack that its message and cause do not write. `frames` follows the
// `${name}: ${message}` header when the runtime writes one, and is the whole stack otherwise.
type StackBase =
  | { kind: "headed"; frames: string }
  | { kind: "headless"; stack: string }
  | { kind: "missing" }

// WeakMaps rather than #private fields: the declaration emitter turns native private
// fields into a bare `private;` member that breaks consumer typechecking
// (see scripts/verify-package.ts).
const causes = new WeakMap<Fault, unknown>()
const stackBases = new WeakMap<Fault, StackBase>()

const CAUSE_BLOCK_MARKER = "\nCaused by: "

function getHeader(fault: Fault): string {
  return fault.message === "" ? fault.name : `${fault.name}: ${fault.message}`
}

// Splits a stack into its base, cutting any serialized cause block. The search for the block
// starts after the header, because a multiline message can contain the marker too.
function toStackBase(stack: string | undefined, header: string): StackBase {
  if (stack === undefined) return { kind: "missing" }

  const headed = stack.startsWith(header)
  const rest = headed ? stack.slice(header.length) : stack
  const index = rest.indexOf(CAUSE_BLOCK_MARKER)
  const kept = index === -1 ? rest : rest.slice(0, index)
  return headed ? { frames: kept, kind: "headed" } : { kind: "headless", stack: kept }
}

// The runtime writes the header on the first read of `stack`, so the base is read only when
// a change needs it: a subclass sets its message after super(), and a stack read in the
// constructor would keep the tag as its message.
function getStackBase(fault: Fault): StackBase {
  let base = stackBases.get(fault)
  if (base === undefined) {
    base = toStackBase(fault.stack, getHeader(fault))
    stackBases.set(fault, base)
  }
  return base
}

// Returns the stack that describes the fault's current message and cause.
function renderStack(fault: Fault): string | undefined {
  const base = getStackBase(fault)
  if (base.kind === "missing") return undefined

  const head = base.kind === "headed" ? `${getHeader(fault)}${base.frames}` : base.stack
  const cause = causes.get(fault)
  return cause instanceof Error && cause.stack
    ? `${head}${CAUSE_BLOCK_MARKER}${cause.stack.replaceAll("\n", "\n  ")}`
    : head
}

// An accessor shared by every fault, so that assigning `cause` from any caller updates
// `stack`. Fault defines it on each instance, so that `cause` stays an own property.
// `message` stays a data property, because Bun reads it directly to write the header.
const causeProperty: PropertyDescriptor = {
  configurable: true,
  enumerable: true,
  get(this: Fault): unknown {
    return causes.get(this)
  },
  set(this: Fault, cause: unknown): void {
    causes.set(this, cause)
    this.stack = renderStack(this)
  },
}

// Revival sets a cause without writing it into the stack, because a serialized stack already
// holds its cause block.
export function restoreCause(fault: Fault, cause: unknown): void {
  causes.set(fault, cause)
}

// Revival keeps a serialized stack as it was, and makes it the base that later message and
// cause changes rebuild from.
export function restoreStackBase(fault: Fault): void {
  stackBases.set(fault, toStackBase(fault.stack, getHeader(fault)))
}

function defaultTrimFormatter(value: string): string {
  return value.trim()
}

export function toCause(cause: unknown, depth: number): SerializableCause {
  if (isFault(cause)) {
    return { kind: "fault", value: serializeFault(cause, depth + 1) }
  }

  if (cause instanceof Error) {
    const serialized: SerializableCause = {
      kind: "error",
      message: cause.message,
      name: cause.name,
      stack: cause.stack,
    }

    // Native errors count toward the same depth budget as fault edges.
    if (cause.cause !== undefined && depth + 1 < MAX_CAUSE_DEPTH) {
      serialized.cause = toCause(cause.cause, depth + 1)
    }

    return serialized
  }

  return { kind: "thrown", value: normalizeThrown(cause) }
}

function serializeFault(fault: Fault, depth: number): SerializableFault {
  const serialized: SerializableFault = {
    __fault: true,
    _tag: fault._tag,
    message: fault.message,
    name: fault.name,
  }

  // Deep serializability of field values is a typed contract, not runtime-validated.
  if (Object.keys(fault.fields).length > 0) serialized.fields = { ...fault.fields }
  if (fault.description !== undefined) serialized.description = fault.description
  if (fault.meta !== undefined) serialized.meta = fault.meta
  if (fault.stack !== undefined) serialized.stack = fault.stack

  if (fault.cause !== undefined && depth < MAX_CAUSE_DEPTH) {
    serialized.cause = toCause(fault.cause, depth)
  }

  return serialized
}

function valueToMessage(value: unknown): string {
  if (value instanceof Error) return value.message
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return `${value}`
  }
  if (typeof value === "symbol") {
    return value.description ?? value.toString()
  }
  if (value === undefined) return "undefined"
  if (value === null) return "null"

  if (typeof value === "object") {
    try {
      // JSON.stringify returns undefined when toJSON returns undefined or a function.
      const serialized = JSON.stringify(value) as string | undefined
      return serialized ?? Object.prototype.toString.call(value)
    } catch {
      return Object.prototype.toString.call(value)
    }
  }

  return ""
}

// Generic over its fields, so a tagged fault types `fields` exactly while every fault
// still extends the default `Fault`.
export abstract class Fault<
  Fields extends Record<string, SerializableValue> = Record<string, SerializableValue>,
> extends Error {
  readonly _tag: string
  // The typed fields live in their own object, so no field name can collide with a
  // Fault method or an envelope key.
  readonly fields: Readonly<Fields>
  // `declare` keeps the type without a class field, which would replace the cause accessor
  // that the constructor defines.
  declare cause?: unknown
  meta?: Record<string, SerializableValue>
  description?: string

  protected constructor(tag: string, fields?: Fields) {
    super(tag)
    Object.defineProperty(this, "cause", causeProperty)
    this._tag = tag
    this.name = tag
    // Spread copies an own "__proto__" key as data instead of calling its setter. A subclass
    // that omits fields gets an empty object, which only the default Fields type describes.
    // Tagged constructors always pass their fields, so their types stay exact.
    this.fields = { ...fields } as Readonly<Fields>
  }

  withMeta(meta: Record<string, SerializableValue>): this {
    this.meta = { ...this.meta, ...meta }
    return this
  }

  withMessage(message: string): this {
    // Read the base while the stack header still holds the old message.
    getStackBase(this)
    this.message = message
    this.stack = renderStack(this)
    return this
  }

  withDescription(description: string): this {
    this.description = description
    return this
  }

  withCause(cause: unknown): this {
    this.cause = cause
    return this
  }

  unwrap(): [Fault, ...unknown[]] {
    const chain: unknown[] = [this]
    let current: unknown = this.cause
    let depth = 0

    while (current !== undefined && depth < MAX_CAUSE_DEPTH) {
      chain.push(current)
      depth += 1

      if (current instanceof Error) {
        current = current.cause
        continue
      }

      break
    }

    return chain as [Fault, ...unknown[]]
  }

  getTags(): string[] {
    return this.unwrap()
      .filter((item): item is Fault => item instanceof Fault)
      .map((item) => item._tag)
  }

  getContext(): Record<string, unknown> {
    const faults = this.unwrap().filter((item): item is Fault => item instanceof Fault)
    // A Map (not a plain object) so keys like "constructor" or "__proto__"
    // are neither mistaken for existing entries nor routed through setters.
    const merged = new Map<string, unknown>()

    for (const fault of faults) {
      const meta = fault.meta ?? {}

      for (const [key, value] of Object.entries(meta)) {
        if (!merged.has(key)) {
          merged.set(key, value)
        }
      }
    }

    return Object.fromEntries(merged)
  }

  flatten(options?: FlattenOptions): string {
    const {
      field = "message",
      formatter = defaultTrimFormatter,
      separator = " -> ",
    } = options ?? {}

    // The description path does not deduplicate, because each layer usually describes a
    // different step. The message path deduplicates, because wrappers often copy the inner
    // message verbatim.
    if (field === "description") {
      return this.unwrap()
        .filter((item): item is Fault => item instanceof Fault)
        .map((item) => item.description)
        .filter((value): value is string => value !== undefined)
        .map((value) => formatter(value))
        .filter((value) => value !== "")
        .join(separator)
    }

    const values = this.unwrap().map((item) => formatter(valueToMessage(item)))
    const deduped: string[] = []
    let previous: string | undefined

    for (const value of values) {
      if (value !== "" && value !== previous) {
        deduped.push(value)
        previous = value
      }
    }

    return deduped.join(separator)
  }

  toSerializable(): SerializableFault {
    return serializeFault(this, 0)
  }

  toJSON(): SerializableFault {
    return this.toSerializable()
  }
}

export function isFault(value: unknown): value is Fault {
  return value instanceof Fault
}

export function findCause<T>(
  err: unknown,
  ctor: abstract new (...args: never[]) => T
): T | undefined {
  if (!(err instanceof Fault)) return undefined
  return err.unwrap().find((item): item is T => item instanceof ctor)
}

// Serializes any caught value: Faults encode themselves; anything else is
// wrapped in an UnknownError/UnknownThrown envelope.
export function toSerializable(value: unknown): SerializableFault {
  if (value instanceof Fault) {
    return value.toSerializable()
  }

  if (value instanceof Error) {
    return {
      __fault: true,
      _tag: "UnknownError",
      cause: toCause(value, 0),
      message: value.message,
      name: "UnknownError",
    }
  }

  return {
    __fault: true,
    _tag: "UnknownThrown",
    cause: toCause(value, 0),
    message: "UnknownThrown",
    name: "UnknownThrown",
  }
}
