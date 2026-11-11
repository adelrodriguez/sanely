# `@sanely/errors` reference

The package has three entry points. The examples import the root entry point as a namespace, with `import * as Fault from "@sanely/errors"`.

| Entry point             | Exports                                                                                                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@sanely/errors`        | `Base`, `Tagged`, `registry`, `merge`, `matchTag`, `matchTags`, `is` (alias `isFault`), `findCause`, `toSerializable`, `fromSerializable`, `isSerializable` (alias `isSerializableFault`) |
| `@sanely/errors/errors` | `RegistryTagMismatchError`, `RegistryMergeConflictError`, `RegistryNotRecognizedError`, `RegistryUnknownTagError`, `RegistryConstructorError`, `InvalidPayloadError`                      |
| `@sanely/errors/types`  | The types `FaultRegistry`, `FlattenOptions`, `FlattenField`, `TagOf`, `ByTag`, `SerializableValue`, `SerializableFault`, and `SerializableCause`                                          |

## `Fault.Base`

The abstract base class of every fault. It extends `Error`. Create subclasses with `Tagged`, and use `Fault.Base` in `instanceof` checks and types.

`Fault.Base` takes the type of its fields as an optional type argument. `Fault.Base` alone has open fields, and `Fault.Base<{ id: string }>` types `fields` exactly.

### Properties

| Property      | Type                                             | Description                                                                                                                                         |
| ------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_tag`        | `string`                                         | The tag. Also the value of `name`.                                                                                                                  |
| `fields`      | `Readonly<Record<string, SerializableValue>>`    | The typed fields. Empty when the fault has none.                                                                                                    |
| `message`     | `string`                                         | The message for the user. The default is the tag.                                                                                                   |
| `description` | `string \| undefined`                            | What happened, for debugging.                                                                                                                       |
| `meta`        | `Record<string, SerializableValue> \| undefined` | Structured metadata, such as `{ traceId }`.                                                                                                         |
| `cause`       | `unknown`                                        | The cause. When the cause is an `Error`, setting it adds the stack of the cause to `stack` after `Caused by:`, in place of any earlier cause block. |

### Methods

Each `with` method changes the fault and returns it, so you can chain the calls.

| Method                         | Description                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| `withMessage(message)`         | Sets `message`, and writes it into the first line of `stack`.                             |
| `withDescription(description)` | Sets `description`.                                                                       |
| `withMeta(meta)`               | Merges `meta` into the current metadata.                                                  |
| `withCause(cause)`             | Sets `cause`.                                                                             |
| `unwrap()`                     | Returns the cause chain as an array, from the head to the leaf.                           |
| `getTags()`                    | Returns the `_tag` of each fault in the chain.                                            |
| `getContext()`                 | Returns the merged `meta` of every fault in the chain. The head wins a conflict.          |
| `flatten(options?)`            | Joins the chain into one string. See [`flatten(options)`](#flattenoptions).               |
| `toSerializable()`             | Returns the [wire format](#wire-format) of the fault.                                     |
| `toJSON()`                     | Returns the same value as `toSerializable()`, so `JSON.stringify` writes the wire format. |

```ts
const fault = new ValidationError({ field: "email" })
  .withMessage("Invalid email format")
  .withDescription("Validation failed for user signup")
  .withMeta({ traceId: "trace-123" })
  .withCause(originalError)
```

The chain follows the `cause` of each fault and each native `Error`. It stops at a value that is not an `Error`, or after 100 links.

### `flatten(options)`

| Option      | Type                         | Default     | Description                          |
| ----------- | ---------------------------- | ----------- | ------------------------------------ |
| `field`     | `"message" \| "description"` | `"message"` | The field to collect from the chain. |
| `separator` | `string`                     | `" -> "`    | The string between two values.       |
| `formatter` | `(value: string) => string`  | Trim        | Changes each value before the join.  |

With `field: "message"`, the chain includes values that are not faults, through `Error.message` or a string form of the value. `flatten` removes empty values and a value that is the same as the value before it. With `field: "description"`, the chain includes only faults with a `description`, and `flatten` removes only empty values.

```ts
outer.flatten() // "User not found -> Service unavailable -> db down"
```

## `Tagged(tag)<Fields>()`

```ts
function Tagged<const Tag extends string>(
  tag: Tag
): <Fields extends Record<string, SerializableValue> = Record<never, never>>() => TaggedClass<
  Tag,
  Fields
>
```

Returns a fault class to extend. Its constructor takes `Fields` as its only argument, or no argument when `Fields` is empty. The fault keeps a copy of the fields in its read-only `fields` object. The class has a static `_tag`.

```ts
class NotFoundError extends Fault.Tagged("NotFoundError")<{ id: string }>() {}

new NotFoundError({ id: "123" }).fields.id // "123"
```

## Registry

### `registry(constructors)`

```ts
function registry<const M extends Record<string, AnyFaultCtor>>(constructors: M): FaultRegistry<M>
```

Creates a registry from an object of fault classes. Each key must be the tag of its class, or `registry` throws `RegistryTagMismatchError`. Each class must have a constructor that takes the fields object as its only parameter, or TypeScript rejects the call.

### `merge(a, b, ...rest)`

```ts
function merge(a: FaultRegistry, b: FaultRegistry, ...rest: FaultRegistry[]): FaultRegistry
```

Returns one registry with the classes of every registry. It takes at least two registries, as a list with a known length. It throws `RegistryMergeConflictError` when two registries map one tag to different classes, and `RegistryNotRecognizedError` for a value that `registry()` or `merge()` did not create, such as a spread copy of a registry.

### `FaultRegistry` members

Membership uses the class, not only the tag. A fault from another class with the same tag is not a member.

| Member                                     | Description                                                                                                                                                                                                                         |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Type`                                     | Type only. The union of the fault types. Use it as `typeof registry.Type`.                                                                                                                                                          |
| `tags`                                     | The registered tags, in the order of the keys.                                                                                                                                                                                      |
| `create(tag, fields?)`                     | Creates a fault. Throws `RegistryUnknownTagError` for an unknown tag.                                                                                                                                                               |
| `wrap(cause).as(tag, fields?)`             | Creates a fault with `cause` as its cause. Throws `RegistryUnknownTagError` for an unknown tag.                                                                                                                                     |
| `is(value)`                                | Returns `true` when `value` is a member. A type guard.                                                                                                                                                                              |
| `findCause(value, tag)`                    | Returns the first member with `tag` in the chain, from the head and including it, or `undefined`.                                                                                                                                   |
| `matchTag(value, tag, handler, fallback?)` | Calls `handler` when `value` is a member with `tag`. Otherwise calls `fallback` with `value`, or returns `undefined`.                                                                                                               |
| `matchTags(value, handlers, fallback?)`    | Calls the handler for the tag of a member. Otherwise calls `fallback` with `value`, or returns `undefined`.                                                                                                                         |
| `toSerializable(value)`                    | The same wire format as the standalone `toSerializable`. For a member, the result type narrows by `_tag` to that member's `fields`.                                                                                                 |
| `fromSerializable(value)`                  | Builds a fault from the wire format. A registered tag becomes an instance of its class, with the fields its constructor received. Any other tag becomes a generic `Fault.Base`. Throws `InvalidPayloadError` for a malformed value. |

```ts
const AppFault = Fault.registry({ NotFoundError, TimeoutError })

AppFault.tags // ["NotFoundError", "TimeoutError"]

const wire = AppFault.toSerializable(AppFault.create("NotFoundError", { id: "123" }))
if (wire._tag === "NotFoundError") wire.fields.id // string
```

## Matching

### `matchTag(fault, tag, handler, fallback?)`

Calls `handler` when `fault._tag` is `tag`, and `fallback` otherwise. `fault` must have a fault union type. `fallback` receives the union without the matched type.

### `matchTags(fault, handlers, fallback?)`

Calls the handler for `fault._tag`, and `fallback` with `fault` when no handler matches. `fault` must have a fault union type. When the handlers cover every tag of the union, the result type has no `undefined`.

```ts
Fault.matchTags(error, { NotFoundError: () => 404, TimeoutError: () => 503 })
```

## Other functions

| Function                  | Description                                                                                                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `is(value)`               | Returns `true` when `value` is an instance of `Fault.Base`. It uses `instanceof`, so it does not work across realms. `isFault` is the same function.                                                |
| `findCause(value, Class)` | Returns the first node of the chain, from the head and including it, that is an instance of `Class`. Returns `undefined` when `value` is not a fault.                                               |
| `toSerializable(value)`   | Returns the wire format of any value. A fault serializes itself. A native `Error` gets the tag `UnknownError`, and any other value gets the tag `UnknownThrown`. The original value is the `cause`. |
| `fromSerializable(value)` | Builds a generic `Fault.Base` from the wire format, without its subclass. Accepts any value, and throws `InvalidPayloadError` when the envelope or any cause is malformed.                          |
| `isSerializable(value)`   | Returns `true` when `fromSerializable` accepts `value`. Both use the same check. It does not check the values of fields and `meta` deeply. `isSerializableFault` is the same function.              |

```ts
Fault.is(new NotFoundError({ id: "123" })) // true
Fault.findCause(outer, TimeoutError) // TimeoutError | undefined
Fault.toSerializable(new Error("boom"))._tag // "UnknownError"
Fault.fromSerializable(payload)._tag // the tag from the payload
Fault.isSerializable({ __fault: true, _tag: "X", name: "X" }) // true
```

## Wire format

`SerializableFault` is a plain object with these properties:

| Property      | Type                                | Required | Description                                             |
| ------------- | ----------------------------------- | -------- | ------------------------------------------------------- |
| `__fault`     | `true`                              | Yes      | The marker of the wire format.                          |
| `_tag`        | `string`                            | Yes      | The tag.                                                |
| `name`        | `string`                            | Yes      | The name.                                               |
| `message`     | `string`                            | No       | The message for the user. The package always writes it. |
| `description` | `string`                            | No       | What happened, for debugging.                           |
| `meta`        | `Record<string, SerializableValue>` | No       | The metadata.                                           |
| `stack`       | `string`                            | No       | The stack. Deserialization keeps it as it was.          |
| `cause`       | `SerializableCause`                 | No       | The cause.                                              |
| `fields`      | `Record<string, SerializableValue>` | No       | The fields. The package writes it when a fault has any. |

`SerializableCause` is one of these objects:

- `{ kind: "fault", value: SerializableFault }` for a fault.
- `{ kind: "error", name, message, stack?, cause? }` for a native `Error`.
- `{ kind: "thrown", value: SerializableValue }` for any other value.

`SerializableValue` is a JSON-safe value: a string, a number, a boolean, `null`, `undefined`, an array of these values, or an object of these values. The type checks `meta` and the fields when you create a fault. The package does not check them deeply at run time. A cause that is not JSON-safe becomes a JSON-safe value during serialization.

Serialization and chain traversal stop after 100 nested causes. Deserialization throws `InvalidPayloadError` for a deeper chain.

## Field names

Fields live in the `fields` object of a fault, and in the `fields` object of the wire format. Any name works as a field, including `message`, `withMeta`, `toString`, and `__proto__`. A subclass must not redeclare `fields`.

## Errors

The errors of the package are tagged faults, and come from `@sanely/errors/errors`. Their data is in `fields`:

| Error                        | Fields                   | Thrown when                                       |
| ---------------------------- | ------------------------ | ------------------------------------------------- |
| `RegistryTagMismatchError`   | `registryKey`, `ctorTag` | A `registry` key is not the tag of its class.     |
| `RegistryMergeConflictError` | `conflictingTag`         | `merge` finds one tag for two different classes.  |
| `RegistryNotRecognizedError` |                          | `merge` receives a value that is not a registry.  |
| `RegistryUnknownTagError`    | `tag`                    | `create` or `wrap().as` receives an unknown tag.  |
| `RegistryConstructorError`   | `tag`                    | A registered constructor does not create a fault. |
| `InvalidPayloadError`        | `reason`                 | `fromSerializable` receives a malformed value.    |

## Types

The types come from `@sanely/errors/types`:

| Type                | Describes                                           |
| ------------------- | --------------------------------------------------- |
| `FaultRegistry<M>`  | The value that `registry` and `merge` return.       |
| `FlattenOptions`    | The options of `flatten`.                           |
| `FlattenField`      | `"message" \| "description"`.                       |
| `TagOf<E>`          | The tag type of the fault type `E`.                 |
| `ByTag<E, T>`       | The member of the fault union `E` with the tag `T`. |
| `SerializableValue` | A JSON-safe value. See [Wire format](#wire-format). |
| `SerializableFault` | The wire format of a fault.                         |
| `SerializableCause` | The wire format of a cause.                         |

```ts
import type { FaultRegistry, SerializableFault } from "@sanely/errors/types"
```
