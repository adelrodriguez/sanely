import type { SerializableValue } from "./wire"
import { Fault } from "./fault"

type TaggedArgs<Fields extends Record<string, SerializableValue>> = keyof Fields extends never
  ? [fields?: Record<string, never>]
  : [fields: Fields]

export type TaggedInstance<
  Tag extends string,
  Fields extends Record<string, SerializableValue>,
> = Fault<Fields> & {
  readonly _tag: Tag
}

export type TaggedClass<
  Tag extends string,
  Fields extends Record<string, SerializableValue>,
> = abstract new (...args: TaggedArgs<Fields>) => TaggedInstance<Tag, Fields>

export function Tagged<const Tag extends string>(tag: Tag) {
  // Interface-declared fields need an explicit index signature; use a type alias or inline type.
  return function <
    Fields extends Record<string, SerializableValue> = Record<never, never>,
  >(): TaggedClass<Tag, Fields> {
    abstract class TaggedFault extends Fault<Fields> {
      static readonly _tag: Tag = tag

      // Recommended convention: keep class name equal to `_tag` for readability.
      // This is not enforced at runtime.

      constructor(...args: TaggedArgs<Fields>) {
        // TaggedArgs is a conditional on Fields, so TypeScript cannot narrow args[0] to Fields here.
        super(tag, (args[0] ?? {}) as Fields)
      }
    }

    return TaggedFault as unknown as TaggedClass<Tag, Fields>
  }
}
