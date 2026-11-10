import { ReservedFieldError } from "./errors"
import { Fault, isReservedKey } from "./fault"
import { definePayloadField, type EnvelopeKey, type SerializableValue } from "./wire"

// The fields each Tagged constructor assigned. Subclass field definitions run after
// the base constructor and can overwrite them, so registry revival restores them.
const assignedFields = new WeakMap<Fault, Record<string, SerializableValue>>()

type TaggedArgs<Fields extends Record<string, SerializableValue>> = keyof Fields extends never
  ? [fields?: Record<string, never>]
  : [fields: Fields]

// The reserved keys the type checker can name. isReservedKey also covers legacy
// Object.prototype accessors such as __defineGetter__, which the types omit.
type ReservedFieldKey = EnvelopeKey | keyof Fault | keyof typeof Object.prototype | "__proto__"

// Maps each reserved key in Fields to an error message, so declaring one fails to
// compile. Fields with an index signature have no known keys to check.
type RejectReservedFields<Fields> = string extends keyof Fields
  ? unknown
  : { [Key in keyof Fields & ReservedFieldKey]: `'${Key & string}' is a reserved Fault key` }

export type TaggedInstance<
  Tag extends string,
  Fields extends Record<string, SerializableValue>,
> = Fault
  & Readonly<Fields> & {
    readonly _tag: Tag
  }

export type TaggedClass<
  Tag extends string,
  Fields extends Record<string, SerializableValue>,
> = abstract new (...args: TaggedArgs<Fields>) => TaggedInstance<Tag, Fields>

export function Tagged<const Tag extends string>(tag: Tag) {
  // Interface-declared fields need an explicit index signature; use a type alias or inline type.
  return function <
    Fields extends Record<string, SerializableValue> & RejectReservedFields<Fields> = Record<
      never,
      never
    >,
  >(): TaggedClass<Tag, Fields> {
    abstract class TaggedFault extends Fault {
      static readonly _tag: Tag = tag

      // Recommended convention: keep class name equal to `_tag` for readability.
      // This is not enforced at runtime.

      constructor(...args: TaggedArgs<Fields>) {
        super(tag)

        const fields = (args[0] ?? {}) as Record<string, SerializableValue>

        for (const key of Object.keys(fields)) {
          if (isReservedKey(key)) {
            throw new ReservedFieldError({ field: key })
          }
        }

        Object.assign(this, fields)
        assignedFields.set(this, fields)
      }
    }

    return TaggedFault as unknown as TaggedClass<Tag, Fields>
  }
}

// Re-applies the fields that a Tagged constructor assigned to `fault`, after subclass
// field initializers or redeclared fields replaced them. Other faults are unchanged.
export function restoreTaggedFields(fault: Fault): void {
  const fields = assignedFields.get(fault)
  if (fields === undefined) return

  const target = fault as unknown as Record<string, unknown>
  for (const [key, value] of Object.entries(fields)) {
    definePayloadField(target, key, value)
  }
}
