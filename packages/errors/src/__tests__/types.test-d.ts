// Compile-time checks only: `pnpm run check` enforces this file, and Vitest never runs it.
import { expectTypeOf } from "vitest"
import type {
  RegistryConstructorError,
  RegistryMergeConflictError,
  RegistryNotRecognizedError,
  RegistryTagMismatchError,
  RegistryUnknownTagError,
} from "#errors.ts"
import type {
  ByTag,
  FaultRegistry,
  FlattenField,
  FlattenOptions,
  SerializableCause,
  SerializableFault,
  SerializableValue,
  TagOf,
} from "#types.ts"
import { InvalidPayloadError } from "#errors.ts"

import {
  type Base,
  findCause,
  fromSerializable,
  isSerializableFault,
  matchTag,
  matchTags,
  merge,
  registry,
  Tagged,
  toSerializable,
} from "#index.ts"

// ── Helpers ──────────────────────────────────────────────────────────────────
type JsonValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }

// ── Test fixtures ────────────────────────────────────────────────────────────
class NotFoundError extends Tagged("NotFoundError")<{ id: string }>() {}
class TimeoutError extends Tagged("TimeoutError")() {}
class DatabaseError extends Tagged("DatabaseError")<{ query: string }>() {}
class PaymentError extends Tagged("PaymentError")<{ invoiceId: string }>() {}

const AppFault = registry({ NotFoundError, TimeoutError })
const DbFault = registry({ DatabaseError })
const BillingFault = registry({ PaymentError })
type AppError = NotFoundError | TimeoutError | PaymentError

// ── Positive type-level tests ────────────────────────────────────────────────
// Gives Tagged instances the correct _tag literal type.
{
  const fault = new NotFoundError({ id: "123" })

  expectTypeOf(fault._tag).toEqualTypeOf<"NotFoundError">()
}

// Exposes Tagged fields as a readonly fields object.
{
  const fault = new NotFoundError({ id: "123" })

  expectTypeOf(fault.fields.id).toEqualTypeOf<string>()
  expectTypeOf(fault.fields).toEqualTypeOf<Readonly<{ id: string }>>()
  // @ts-expect-error -- fields are readonly
  fault.fields.id = "456"
  // @ts-expect-error -- fields are not instance properties
  void fault.id
}

// Accepts any field name, including envelope keys, Fault methods, and Object.prototype names.
{
  class AnyNameError extends Tagged("AnyNameError")<{
    name: string
    withMeta: string
    toString: string
    fields: number
  }>() {}

  const fault = new AnyNameError({ fields: 1, name: "n", toString: "t", withMeta: "w" })

  expectTypeOf(fault.fields.name).toEqualTypeOf<string>()
  expectTypeOf(fault.fields.withMeta).toEqualTypeOf<string>()
  expectTypeOf(fault.fields.fields).toEqualTypeOf<number>()
  expectTypeOf<AnyNameError["withMeta"]>().toBeFunction()
  expectTypeOf(fault.name).toEqualTypeOf<string>()
}

// Makes Tagged instances extend Fault.
{
  const fault = new NotFoundError({ id: "123" })

  expectTypeOf(fault).toExtend<Base>()
}

// Exports public contracts from the types entrypoint.
{
  expectTypeOf(AppFault).toExtend<
    FaultRegistry<{
      NotFoundError: typeof NotFoundError
      TimeoutError: typeof TimeoutError
    }>
  >()
  expectTypeOf<FlattenField>().toEqualTypeOf<"description" | "message">()
  expectTypeOf<FlattenOptions["field"]>().toEqualTypeOf<FlattenField | undefined>()
  expectTypeOf<TagOf<AppError>>().toEqualTypeOf<"NotFoundError" | "PaymentError" | "TimeoutError">()
  expectTypeOf<ByTag<AppError, "PaymentError">>().toEqualTypeOf<PaymentError>()
  expectTypeOf<SerializableFault["__fault"]>().toEqualTypeOf<true>()
  expectTypeOf<SerializableCause["kind"]>().toEqualTypeOf<"error" | "fault" | "thrown">()
  expectTypeOf<SerializableFault>().toExtend<JsonValue>()
  expectTypeOf<
    Extract<SerializableCause, { kind: "thrown" }>["value"]
  >().toEqualTypeOf<SerializableValue>()

  const value: SerializableValue = { nested: ["value", null] }
  void value
}

// Infers the correct registry.create instance type.
{
  const fault = AppFault.create("NotFoundError", { id: "123" })

  expectTypeOf(fault).toEqualTypeOf<NotFoundError>()
  expectTypeOf(fault.fields.id).toEqualTypeOf<string>()
}

// Infers the correct registry.wrap().as instance type.
{
  const fault = AppFault.wrap(new Error("root")).as("NotFoundError", { id: "123" })

  expectTypeOf(fault).toEqualTypeOf<NotFoundError>()
  expectTypeOf(fault.fields.id).toEqualTypeOf<string>()
}

// Types a registry member's wire format by tag, and keeps unknown values on the open type.
{
  const member: typeof AppFault.Type = AppFault.create("NotFoundError", { id: "123" })
  const caught: unknown = member
  const wire = AppFault.toSerializable(member)

  expectTypeOf(wire._tag).toEqualTypeOf<"NotFoundError" | "TimeoutError">()
  if (wire._tag === "NotFoundError") {
    expectTypeOf(wire.fields).toEqualTypeOf<Readonly<{ id: string }>>()
  } else {
    expectTypeOf(wire.fields).toEqualTypeOf<undefined>()
  }
  expectTypeOf(AppFault.toSerializable(caught)).toEqualTypeOf<SerializableFault>()
}

// Marks wire fields optional when a member's fields can be empty, because the serializer omits them.
{
  class LabelsError extends Tagged("LabelsError")<Record<string, string>>() {}
  class OptionalError extends Tagged("OptionalError")<{ hint?: string }>() {}
  const Open = registry({ LabelsError, OptionalError })
  const member: typeof Open.Type = Open.create("LabelsError", {})
  const wire = Open.toSerializable(member)

  if (wire._tag === "LabelsError") {
    expectTypeOf(wire.fields).toEqualTypeOf<Readonly<Record<string, string>> | undefined>()
  } else {
    expectTypeOf(wire.fields).toEqualTypeOf<Readonly<{ hint?: string }> | undefined>()
  }
}

// Types registry guards, tags, and serialization contracts.
{
  const value: unknown = AppFault.create("TimeoutError")
  const tags = AppFault.tags
  const fault = AppFault.create("NotFoundError", { id: "123" })
  const serialized = fault.toSerializable()
  const registrySerialized = AppFault.toSerializable(fault)
  const standaloneSerialized = toSerializable(value)
  const generic = fromSerializable(serialized)
  const restored = AppFault.fromSerializable(serialized)

  if (AppFault.is(value)) {
    expectTypeOf(value).toEqualTypeOf<NotFoundError | TimeoutError>()
  }

  expectTypeOf(AppFault.findCause(value, "NotFoundError")).toEqualTypeOf<
    NotFoundError | undefined
  >()
  expectTypeOf(findCause(value, TimeoutError)).toEqualTypeOf<TimeoutError | undefined>()

  if (isSerializableFault(value)) {
    expectTypeOf(value).toEqualTypeOf<SerializableFault>()
  }
  // Received data parses without a cast.
  expectTypeOf(fromSerializable(value)).toEqualTypeOf<Base>()
  expectTypeOf(AppFault.fromSerializable(value)).toEqualTypeOf<
    NotFoundError | TimeoutError | Base
  >()
  expectTypeOf(findCause(value, TypeError)).toEqualTypeOf<TypeError | undefined>()

  expectTypeOf(tags).toEqualTypeOf<ReadonlyArray<"NotFoundError" | "TimeoutError">>()
  expectTypeOf(serialized).toEqualTypeOf<SerializableFault>()
  expectTypeOf(registrySerialized).toExtend<SerializableFault>()
  expectTypeOf(standaloneSerialized).toEqualTypeOf<SerializableFault>()
  expectTypeOf(generic).toEqualTypeOf<Base>()
  expectTypeOf(restored).toEqualTypeOf<Base | NotFoundError | TimeoutError>()
}

// Exposes the registry fault union as Type.
{
  const MergedFault = merge(AppFault, DbFault)

  expectTypeOf<typeof AppFault.Type>().toEqualTypeOf<NotFoundError | TimeoutError>()
  expectTypeOf<typeof DbFault.Type>().toEqualTypeOf<DatabaseError>()
  expectTypeOf<typeof MergedFault.Type>().toEqualTypeOf<
    NotFoundError | TimeoutError | DatabaseError
  >()
}

// Types the registry.matchTag handler instance.
{
  const fault = AppFault.create("NotFoundError", { id: "123" })

  AppFault.matchTag(fault, "NotFoundError", (e) => {
    expectTypeOf(e).toEqualTypeOf<NotFoundError>()
    expectTypeOf(e.fields.id).toEqualTypeOf<string>()
    return e.fields.id
  })
}

// Types registry.matchTags handler instances.
{
  const fault = AppFault.create("NotFoundError", { id: "123" })

  AppFault.matchTags(fault, {
    NotFoundError: (e) => {
      expectTypeOf(e).toEqualTypeOf<NotFoundError>()
      expectTypeOf(e.fields.id).toEqualTypeOf<string>()
      return e.fields.id
    },
    TimeoutError: (e) => {
      expectTypeOf(e).toEqualTypeOf<TimeoutError>()
      return "timeout"
    },
  })
}

// Narrows library errors by tag in standalone matchers.
{
  const err = new InvalidPayloadError({ reason: "_tag must be a string" }) as
    | InvalidPayloadError
    | TimeoutError

  expectTypeOf(err._tag).toEqualTypeOf<"InvalidPayloadError" | "TimeoutError">()

  matchTag(err, "InvalidPayloadError", (e) => {
    expectTypeOf(e).toEqualTypeOf<InvalidPayloadError>()
    expectTypeOf(e.fields.reason).toEqualTypeOf<string>()
  })

  matchTags(err, {
    InvalidPayloadError: (e) => expectTypeOf(e).toEqualTypeOf<InvalidPayloadError>(),
    TimeoutError: (e) => expectTypeOf(e).toEqualTypeOf<TimeoutError>(),
  })
}

// Types a numeric registry key as the string tag that the registry stores.
{
  class NumericError extends Tagged("1")() {}
  const NumericFault = registry({ 1: NumericError })
  const fault = NumericFault.create(1)

  expectTypeOf(fault._tag).toEqualTypeOf<"1">()
  expectTypeOf(NumericFault.tags).toEqualTypeOf<ReadonlyArray<"1">>()

  NumericFault.matchTag(fault, 1, (e) => expectTypeOf(e).toEqualTypeOf<NumericError>())

  // @ts-expect-error -- standalone matchTag takes the fault's string tag, not the registry key
  matchTag(fault, 1, () => "handler")
}

// Narrows every library error by its tag in standalone matchers.
{
  const err = new InvalidPayloadError({ reason: "x" }) as
    | InvalidPayloadError
    | RegistryConstructorError
    | RegistryMergeConflictError
    | RegistryNotRecognizedError
    | RegistryTagMismatchError
    | RegistryUnknownTagError

  expectTypeOf(err._tag).toEqualTypeOf<
    | "InvalidPayloadError"
    | "RegistryConstructorError"
    | "RegistryMergeConflictError"
    | "RegistryNotRecognizedError"
    | "RegistryTagMismatchError"
    | "RegistryUnknownTagError"
  >()

  matchTag(err, "RegistryUnknownTagError", (e) => {
    expectTypeOf(e).toEqualTypeOf<RegistryUnknownTagError>()
    expectTypeOf(e.fields.tag).toEqualTypeOf<string>()
  })

  matchTag(err, "RegistryConstructorError", (e) => {
    expectTypeOf(e).toEqualTypeOf<RegistryConstructorError>()
    expectTypeOf(e.fields.tag).toEqualTypeOf<string>()
  })

  matchTag(err, "RegistryTagMismatchError", (e) => {
    expectTypeOf(e).toEqualTypeOf<RegistryTagMismatchError>()
    expectTypeOf(e.fields.registryKey).toEqualTypeOf<string>()
  })

  matchTag(err, "RegistryMergeConflictError", (e) => {
    expectTypeOf(e).toEqualTypeOf<RegistryMergeConflictError>()
    expectTypeOf(e.fields.conflictingTag).toEqualTypeOf<string>()
  })

  matchTags(err, {
    InvalidPayloadError: (e) => expectTypeOf(e).toEqualTypeOf<InvalidPayloadError>(),
    RegistryConstructorError: (e) => expectTypeOf(e).toEqualTypeOf<RegistryConstructorError>(),
    RegistryMergeConflictError: (e) => expectTypeOf(e).toEqualTypeOf<RegistryMergeConflictError>(),
    RegistryNotRecognizedError: (e) => expectTypeOf(e).toEqualTypeOf<RegistryNotRecognizedError>(),
    RegistryTagMismatchError: (e) => expectTypeOf(e).toEqualTypeOf<RegistryTagMismatchError>(),
    RegistryUnknownTagError: (e) => expectTypeOf(e).toEqualTypeOf<RegistryUnknownTagError>(),
  })
}

// Narrows matchTag handler and return types.
{
  const err = new NotFoundError({ id: "123" }) as AppError

  const withoutFallback = matchTag(err, "NotFoundError", (e) => {
    expectTypeOf(e).toEqualTypeOf<NotFoundError>()
    return e.fields.id
  })

  const withFallback = matchTag(
    err,
    "NotFoundError",
    (e) => {
      expectTypeOf(e).toEqualTypeOf<NotFoundError>()
      return e.fields.id
    },
    (e) => {
      expectTypeOf(e).toEqualTypeOf<TimeoutError | PaymentError>()
      return e._tag
    }
  )

  const heterogeneousResult = matchTag(
    err,
    "NotFoundError",
    () => "found" as const,
    () => 404 as const
  )

  expectTypeOf(withoutFallback).toEqualTypeOf<string | undefined>()
  expectTypeOf(withFallback).toEqualTypeOf<string>()
  expectTypeOf(heterogeneousResult).toEqualTypeOf<"found" | 404>()
}

// Narrows matchTags handlers and return type.
{
  const err = new TimeoutError() as AppError

  const withoutFallback = matchTags(err, {
    NotFoundError: (e) => {
      expectTypeOf(e).toEqualTypeOf<NotFoundError>()
      return e.fields.id
    },
    TimeoutError: (e) => {
      expectTypeOf(e).toEqualTypeOf<TimeoutError>()
      return 408 as const
    },
  })

  const withFallback = matchTags(
    err,
    {
      NotFoundError: (e) => {
        expectTypeOf(e).toEqualTypeOf<NotFoundError>()
        return e.fields.id
      },
    },
    (e) => {
      expectTypeOf(e).toEqualTypeOf<AppError>()
      return false as const
    }
  )

  expectTypeOf(withoutFallback).toEqualTypeOf<string | 408 | undefined>()
  expectTypeOf(withFallback).toEqualTypeOf<string | false>()
}

// Returns R from an exhaustive matchTags map without fallback.
{
  const err = new TimeoutError() as AppError

  const result = matchTags(err, {
    NotFoundError: () => "not-found" as const,
    PaymentError: () => "payment" as const,
    TimeoutError: () => 408 as const,
  })

  expectTypeOf(result).toEqualTypeOf<"not-found" | "payment" | 408>()
}

// Returns R or undefined from a partial matchTags map without fallback.
{
  const err = new TimeoutError() as AppError

  const result = matchTags(err, {
    TimeoutError: () => 408 as const,
  })

  expectTypeOf(result).toEqualTypeOf<408 | undefined>()
}

// Keeps undefined for variable maps with optional handlers.
{
  const err = new TimeoutError() as AppError
  const handlers: Partial<{
    NotFoundError: (error: NotFoundError) => "not-found"
    PaymentError: (error: PaymentError) => "payment"
    TimeoutError: (error: TimeoutError) => 408
  }> = {
    TimeoutError: () => 408,
  }

  const result = matchTags(err, handlers)

  expectTypeOf(result).toEqualTypeOf<"not-found" | "payment" | 408 | undefined>()
}

// Keeps undefined when a required handler may be undefined.
{
  const err = new TimeoutError() as AppError
  const handlers: {
    NotFoundError: ((error: NotFoundError) => "not-found") | undefined
    PaymentError: (error: PaymentError) => "payment"
    TimeoutError: (error: TimeoutError) => 408
  } = {
    NotFoundError: undefined,
    PaymentError: () => "payment",
    TimeoutError: () => 408,
  }

  const result = matchTags(err, handlers)

  expectTypeOf(result).toEqualTypeOf<"not-found" | "payment" | 408 | undefined>()
}

// Narrows registry.matchTag return type with fallback.
{
  const fault = AppFault.create("NotFoundError", { id: "123" })

  const withoutFallback = AppFault.matchTag(fault, "NotFoundError", (e) => e.fields.id)
  const withFallback = AppFault.matchTag(
    fault,
    "NotFoundError",
    () => "found" as const,
    (e) => {
      expectTypeOf(e).toEqualTypeOf<unknown>()
      return 404 as const
    }
  )

  expectTypeOf(withoutFallback).toEqualTypeOf<string | undefined>()
  expectTypeOf(withFallback).toEqualTypeOf<"found" | 404>()
}

// Narrows registry.matchTags return type with fallback.
{
  const fault = AppFault.create("NotFoundError", { id: "123" })

  const withoutFallback = AppFault.matchTags(fault, {
    NotFoundError: () => "not-found" as const,
    TimeoutError: () => 408 as const,
  })
  const withFallback = AppFault.matchTags(
    fault,
    {
      NotFoundError: () => "not-found" as const,
    },
    (e) => {
      expectTypeOf(e).toEqualTypeOf<unknown>()
      return false as const
    }
  )

  expectTypeOf(withoutFallback).toEqualTypeOf<"not-found" | 408 | undefined>()
  expectTypeOf(withFallback).toEqualTypeOf<"not-found" | false>()
}

// Preserves merge type inference across three or more modules.
{
  const MergedFault = merge(AppFault, DbFault, BillingFault)

  const nf = MergedFault.create("NotFoundError", { id: "123" })
  const db = MergedFault.create("DatabaseError", { query: "SELECT 1" })
  const pay = MergedFault.create("PaymentError", { invoiceId: "inv_1" })

  expectTypeOf(nf).toEqualTypeOf<NotFoundError>()
  expectTypeOf(db).toEqualTypeOf<DatabaseError>()
  expectTypeOf(pay).toEqualTypeOf<PaymentError>()
  expectTypeOf(nf.fields.id).toEqualTypeOf<string>()
  expectTypeOf(db.fields.query).toEqualTypeOf<string>()
  expectTypeOf(pay.fields.invoiceId).toEqualTypeOf<string>()
}

// Preserves subclass type through fluent methods.
{
  const fault = new NotFoundError({ id: "123" })
    .withMessage("gone")
    .withDescription("not here")
    .withMeta({ key: "val" })
    .withCause(new Error("root"))

  expectTypeOf(fault).toEqualTypeOf<NotFoundError>()
}

// ── Negative type tests ──────────────────────────────────────────────────────
// These verify that invalid usage produces compile-time errors.
// The function bodies never execute — only the type checker matters.

// ── Registered constructor contract (#66) ────────────────────────────────────
// registry.fromSerializable revives through `new Class(fields)`, so a
// registered constructor must take the fields object as its only parameter.

class PositionalError extends Tagged("PositionalError")<{ id: string }>() {
  constructor(id: string) {
    super({ id })
  }
}

class ExtraParamError extends Tagged("ExtraParamError")<{ id: string }>() {
  constructor(fields: { id: string }, _retryable: boolean) {
    super(fields)
  }
}

class DerivedMessageError extends Tagged("DerivedMessageError")<{ id: string }>() {
  constructor(fields: { id: string }) {
    super(fields)
    this.message = `Missing ${fields.id}`
  }
}

class FieldlessDefaultsError extends Tagged("FieldlessDefaultsError")() {
  constructor() {
    super()
    this.message = "Timed out"
  }

  isRetryable(): boolean {
    return true
  }

  get summary(): string {
    return `${this._tag}: ${this.message}`
  }
}

function _registeredConstructorContract() {
  // @ts-expect-error -- positional constructors cannot be revived from payload fields
  registry({ PositionalError })

  // @ts-expect-error -- a second constructor parameter cannot be supplied on revive
  registry({ ExtraParamError })

  // @ts-expect-error -- one invalid entry rejects the call even next to valid ones
  registry({ DerivedMessageError, PositionalError })

  const Valid = registry({
    DerivedMessageError,
    FieldlessDefaultsError,
    NotFoundError,
    TimeoutError,
  })
  expectTypeOf<
    typeof Valid.create<"DerivedMessageError">
  >().returns.toEqualTypeOf<DerivedMessageError>()
}

function _negativeTypeTests() {
  // @ts-expect-error -- registry state is internal
  void AppFault.__fault

  // @ts-expect-error -- "BadTag" is not a registered tag
  AppFault.create("BadTag", {})

  // @ts-expect-error -- "BadTag" is not a registered tag
  AppFault.findCause(new Error("boom"), "BadTag")

  // @ts-expect-error -- id should be string, not number
  AppFault.create("NotFoundError", { id: 123 })

  // @ts-expect-error -- NotFoundError requires { id: string }
  AppFault.create("NotFoundError")

  // @ts-expect-error -- "BadTag" is not a registered tag
  AppFault.wrap(new Error("root")).as("BadTag", {})

  // @ts-expect-error -- "BadTag" is not a registered tag
  AppFault.matchTag({}, "BadTag", () => "nope")

  // @ts-expect-error -- "BadTag" is not in AppError union
  matchTag(new TimeoutError() as AppError, "BadTag", () => "nope")

  AppFault.matchTags(
    {},
    {
      // @ts-expect-error -- "BadTag" is not a registered tag
      BadTag: () => "nope",
    }
  )

  matchTags(new TimeoutError() as AppError, {
    // @ts-expect-error -- "BadTag" is not in AppError union
    BadTag: () => "nope",
  })

  const MergedFault = merge(AppFault, DbFault)

  // @ts-expect-error -- "BadTag" is not in any merged registry
  MergedFault.create("BadTag", {})

  const fault = AppFault.create("TimeoutError")

  // @ts-expect-error -- flatten field must be "message" | "description"
  fault.flatten({ field: "bad-field" })

  // @ts-expect-error -- metadata values must be JSON-safe SerializableValue values
  fault.withMeta({ createdAt: new Date() })

  // @ts-expect-error -- Tagged fields must contain only JSON-safe SerializableValue values
  class NonSerializableFieldsError extends Tagged("NonSerializableFieldsError")<{
    createdAt: Date
  }>() {}

  void NonSerializableFieldsError
}

// Suppress unused function warning — this exists only for type checking
void _negativeTypeTests
