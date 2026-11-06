# `@sanely/errors` reference

The package has three entry points:

| Entry point             | Exports                                                                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@sanely/errors`        | `Fault`, `Tagged`, `registry`, `merge`, `matchTag`, `matchTags`, `isFault`, `findCause`, `toSerializable`, `fromSerializable`, `isSerializableFault` |
| `@sanely/errors/errors` | `ReservedFieldError`, `RegistryTagMismatchError`, `RegistryMergeConflictError`, `InvalidPayloadError`                                                |
| `@sanely/errors/types`  | The types `FaultRegistry`, `FlattenOptions`, `FlattenField`, `TagOf`, `ByTag`, `SerializableValue`, `SerializableFault`, and `SerializableCause`     |

## `Fault`

The abstract base class of every fault. It extends `Error`. Create subclasses with `Tagged`.

### Properties

| Property  | Type                                             | Description                                       |
| --------- | ------------------------------------------------ | ------------------------------------------------- |
| `_tag`    | `string`                                         | The tag. Also the value of `name`.                |
| `message` | `string`                                         | The message for the user. The default is the tag. |
| `details` | `string \| undefined`                            | The message for logs.                             |
| `meta`    | `Record<string, SerializableValue> \| undefined` | Structured metadata, such as `{ traceId }`.       |
| `cause`   | `unknown`                                        | The cause.                                        |

### Methods

Each `with` method changes the fault and returns it, so you can chain the calls.

| Method                               | Description                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `withMessage(message)`               | Sets `message`.                                                                                         |
| `withDetails(details)`               | Sets `details`.                                                                                         |
| `withDescription(message, details?)` | Sets `message`, and `details` when you give it.                                                         |
| `withMeta(meta)`                     | Merges `meta` into the current metadata.                                                                |
| `withCause(cause)`                   | Sets `cause`. When `cause` is an `Error`, it adds the stack of the cause to `stack` after `Caused by:`. |
| `unwrap()`                           | Returns the cause chain as an array, from the head to the leaf.                                         |
| `getTags()`                          | Returns the `_tag` of each fault in the chain.                                                          |
| `getContext()`                       | Returns the merged `meta` of every fault in the chain. The head wins a conflict.                        |
| `flatten(options?)`                  | Joins the chain into one string. See [`flatten(options)`](#flattenoptions).                             |
| `toSerializable()`                   | Returns the [wire format](#wire-format) of the fault.                                                   |
| `toJSON()`                           | Returns the same value as `toSerializable()`, so `JSON.stringify` writes the wire format.               |

```ts
const fault = new ValidationError({ field: "email" })
  .withDescription("Invalid email format", "Validation failed for user signup")
  .withMeta({ traceId: "trace-123" })
  .withCause(originalError)
```

The chain follows the `cause` of each fault and each native `Error`. It stops at a value that is not an `Error`, or after 100 links.

### `flatten(options)`

| Option      | Type                        | Default     | Description                          |
| ----------- | --------------------------- | ----------- | ------------------------------------ |
| `field`     | `"message" \| "details"`    | `"message"` | The field to collect from the chain. |
| `separator` | `string`                    | `" -> "`    | The string between two values.       |
| `formatter` | `(value: string) => string` | Trim        | Changes each value before the join.  |

With `field: "message"`, the chain includes values that are not faults, through `Error.message` or a string form of the value. `flatten` removes empty values and a value that is the same as the value before it. With `field: "details"`, the chain includes only faults with `details`, and `flatten` removes only empty values.

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

Returns a fault class to extend. Its constructor takes `Fields` as its only argument, or no argument when `Fields` is empty. Each field becomes a read-only property. The class has a static `_tag`.

```ts
class NotFoundError extends Tagged("NotFoundError")<{ id: string }>() {}

new NotFoundError({ id: "123" }).id // "123"
```

The constructor throws `ReservedFieldError` for a [reserved key](#reserved-keys).

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

Returns one registry with the classes of every registry. It takes at least two registries, as a list with a known length. It throws `RegistryMergeConflictError` when two registries map one tag to different classes, and `TypeError` for a value that is not a registry.

### `FaultRegistry` members

Membership uses the class, not only the tag. A fault from another class with the same tag is not a member.

| Member                                     | Description                                                                                                                      |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `Type`                                     | Type only. The union of the fault types. Use it as `typeof registry.Type`.                                                       |
| `tags`                                     | The registered tags, in the order of the keys.                                                                                   |
| `create(tag, fields?)`                     | Creates a fault. Throws `TypeError` for an unknown tag.                                                                          |
| `wrap(cause).as(tag, fields?)`             | Creates a fault with `cause` as its cause.                                                                                       |
| `is(value)`                                | Returns `true` when `value` is a member. A type guard.                                                                           |
| `findCause(value, tag)`                    | Returns the first member with `tag` in the chain, from the head and including it, or `undefined`.                                |
| `matchTag(value, tag, handler, fallback?)` | Calls `handler` when `value` is a member with `tag`. Otherwise calls `fallback` with `value`, or returns `undefined`.            |
| `matchTags(value, handlers, fallback?)`    | Calls the handler for the tag of a member. Otherwise calls `fallback` with `value`, or returns `undefined`.                      |
| `toSerializable(value)`                    | The same as the standalone `toSerializable`.                                                                                     |
| `fromSerializable(data)`                   | Builds a fault from the wire format. A registered tag becomes an instance of its class. Any other tag becomes a generic `Fault`. |

```ts
const AppFault = registry({ NotFoundError, TimeoutError })

AppFault.tags // ["NotFoundError", "TimeoutError"]
```

## Matching

### `matchTag(fault, tag, handler, fallback?)`

Calls `handler` when `fault._tag` is `tag`, and `fallback` otherwise. `fault` must have a fault union type. `fallback` receives the union without the matched type.

### `matchTags(fault, handlers, fallback?)`

Calls the handler for `fault._tag`. `fault` must have a fault union type. When the handlers cover every tag of the union, the result type has no `undefined`.

```ts
matchTags(error, { NotFoundError: () => 404, TimeoutError: () => 503 })
```

## Other functions

| Function                     | Description                                                                                                                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isFault(value)`             | Returns `true` when `value` is an instance of `Fault`. It uses `instanceof`, so it does not work across realms.                                                                                     |
| `findCause(value, Class)`    | Returns the first node of the chain, from the head and including it, that is an instance of `Class`. Returns `undefined` when `value` is not a fault.                                               |
| `toSerializable(value)`      | Returns the wire format of any value. A fault serializes itself. A native `Error` gets the tag `UnknownError`, and any other value gets the tag `UnknownThrown`. The original value is the `cause`. |
| `fromSerializable(data)`     | Builds a generic `Fault` from the wire format, without its subclass. Throws `InvalidPayloadError` for a malformed value.                                                                            |
| `isSerializableFault(value)` | Returns `true` when the envelope and every cause are valid, so `fromSerializable` accepts `value`. It does not check the values of fields and `meta` deeply.                                        |

## Wire format

`SerializableFault` is a plain object with these fields, and one field for each payload field of the fault:

| Field        | Type                                | Required | Description                                             |
| ------------ | ----------------------------------- | -------- | ------------------------------------------------------- |
| `__faultier` | `true`                              | Yes      | The marker of the wire format.                          |
| `_tag`       | `string`                            | Yes      | The tag.                                                |
| `name`       | `string`                            | Yes      | The name.                                               |
| `message`    | `string`                            | No       | The message for the user. The package always writes it. |
| `details`    | `string`                            | No       | The message for logs.                                   |
| `meta`       | `Record<string, SerializableValue>` | No       | The metadata.                                           |
| `stack`      | `string`                            | No       | The stack.                                              |
| `cause`      | `SerializableCause`                 | No       | The cause.                                              |

`SerializableCause` is one of these objects:

- `{ kind: "fault", value: SerializableFault }` for a fault.
- `{ kind: "error", name, message, stack?, cause? }` for a native `Error`.
- `{ kind: "thrown", value: SerializableValue }` for any other value.

`SerializableValue` is a JSON-safe value: a string, a number, a boolean, `null`, `undefined`, an array of these values, or an object of these values. The type checks `meta` and the fields when you create a fault. The package does not check them deeply at run time. A cause that is not JSON-safe becomes a JSON-safe value during serialization.

Serialization, deserialization, and chain traversal stop after 100 nested causes.

## Reserved keys

A key is reserved when it is one of these:

- A wire format key: `__faultier`, `_tag`, `name`, `message`, `details`, `meta`, `stack`, or `cause`.
- A name on the prototype chain of `Fault`: the methods of `Fault`, such as `withMeta` and `unwrap`, and the inherited names `constructor`, `toString`, `toLocaleString`, `valueOf`, `hasOwnProperty`, `isPrototypeOf`, `propertyIsEnumerable`, `__proto__`, `__defineGetter__`, `__defineSetter__`, `__lookupGetter__`, and `__lookupSetter__`.

A `Tagged` constructor throws `ReservedFieldError` for a reserved field name. `fromSerializable` keeps a wire field with a reserved name, and adds the prefix `__payload_` to its name. It adds the prefix again until the name is unique.

## Errors

The errors of the package are faults, and come from `@sanely/errors/errors`:

| Error                        | Fields                   | Thrown when                                            |
| ---------------------------- | ------------------------ | ------------------------------------------------------ |
| `ReservedFieldError`         | `field`                  | A `Tagged` constructor receives a reserved field name. |
| `RegistryTagMismatchError`   | `registryKey`, `ctorTag` | A `registry` key is not the tag of its class.          |
| `RegistryMergeConflictError` | `conflictingTag`         | `merge` finds one tag for two different classes.       |
| `InvalidPayloadError`        | `reason`                 | `fromSerializable` receives a malformed value.         |

## Types

The types come from `@sanely/errors/types`:

| Type                | Describes                                           |
| ------------------- | --------------------------------------------------- |
| `FaultRegistry<M>`  | The value that `registry` and `merge` return.       |
| `FlattenOptions`    | The options of `flatten`.                           |
| `FlattenField`      | `"message" \| "details"`.                           |
| `TagOf<E>`          | The tag type of the fault type `E`.                 |
| `ByTag<E, T>`       | The member of the fault union `E` with the tag `T`. |
| `SerializableValue` | A JSON-safe value. See [Wire format](#wire-format). |
| `SerializableFault` | The wire format of a fault.                         |
| `SerializableCause` | The wire format of a cause.                         |

```ts
import type { FaultRegistry, SerializableFault } from "@sanely/errors/types"
```
