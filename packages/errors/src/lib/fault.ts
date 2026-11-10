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

// A WeakMap rather than a #private field: the declaration emitter turns
// native private fields into a bare `private;` member that breaks consumer
// typechecking (see scripts/verify-package.ts).
const originalStacks = new WeakMap<Fault, string | undefined>()

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
  override cause?: unknown
  meta?: Record<string, SerializableValue>
  description?: string

  protected constructor(tag: string, fields?: Fields) {
    super(tag)
    this._tag = tag
    this.name = tag
    // Spread copies an own "__proto__" key as data instead of calling its setter. A subclass
    // that omits fields gets an empty object, which only the default Fields type describes.
    // Tagged constructors always pass their fields, so their types stay exact.
    this.fields = { ...fields } as Readonly<Fields>
    originalStacks.set(this, this.stack)
  }

  withMeta(meta: Record<string, SerializableValue>): this {
    this.meta = { ...this.meta, ...meta }
    return this
  }

  withMessage(message: string): this {
    this.message = message
    return this
  }

  withDescription(description: string): this {
    this.description = description
    return this
  }

  withCause(cause: unknown): this {
    this.cause = cause
    const originalStack = originalStacks.get(this)

    // Rebuild stack from the original (pre-cause) stack on every call,
    // so replacing a cause doesn't leave stale "Caused by:" blocks.
    if (cause instanceof Error && cause.stack && originalStack) {
      const indented = cause.stack.replaceAll("\n", "\n  ")
      this.stack = `${originalStack}\nCaused by: ${indented}`
    } else {
      this.stack = originalStack
    }

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
