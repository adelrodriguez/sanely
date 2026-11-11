# About faults, registries, and the wire format

This page explains the ideas behind `@sanely/errors`: what a fault carries, why registries check classes and not only tags, and why the wire format has the rules that it has.

## A fault carries a message, a description, and two kinds of data

A plain `Error` has one message, and that message often goes to two readers. The user needs a short statement, such as "User not found". The developer who debugs the failure needs to know what happened, such as "DB query returned 0 rows". A fault keeps these apart: `message` is for the user, and `description` describes the error and what happened, for debugging.

A fault also carries two kinds of data. Its fields, such as `id`, belong to the kind of failure, and the type of the class declares them. They live in `fault.fields`. Its `meta`, such as `{ traceId }`, belongs to the place where the failure happened, and any code can add it with `withMeta`. `getContext()` merges the `meta` of every fault in a cause chain. The head wins a conflict, because the newest fault knows the most about the current request.

## Why `Tagged` takes two calls

`Tagged("NotFoundError")<{ id: string }>()` looks unusual. TypeScript cannot infer one type argument and take another from you in the same call. The first call infers the tag as a literal type, and the second call takes the field type. With one call, you would have to write the tag twice.

## A tag is a name, and a class is an identity

Each fault has a string tag in `_tag`. Code can match a tag with a string comparison, and the tag survives serialization. But two libraries can both define a `NotFoundError`. If a registry matched only by tag, a fault from another library could reach a handler that expects fields that the fault does not have.

So a registry checks the class too. `is`, `findCause`, `matchTag`, and `matchTags` on a registry accept a value only when it is an instance of the registered class with the registered tag. The standalone `matchTag` and `matchTags` do not check membership. They take a value that already has a fault union type, and TypeScript has checked that type.

For the same reason, `merge` refuses one tag for two different classes, and `merge` takes a list with a known length. TypeScript can then keep the class type of each tag in the merged registry.

## Why a registry has its own serializer

The standalone `toSerializable` accepts any value, because it has to handle whatever a `catch` block receives. Its result can only have the open wire type: any tag, any fields.

A registry knows its members. For a member, `registry.toSerializable` returns one wire type for each tag, with that member's fields, and the type narrows when you check `_tag`. A response that carries a fault can then name the exact faults it may send. A client that reads it gets the same guarantee that `matchTags` gives. The runtime work is the same as the standalone function. Only the type is narrower. Creating faults works the same way: `create` and `wrap().as` accept only the registry's tags, and the fields for each tag.

## Why registered constructors take only their fields

A registry reads a serialized fault and builds an instance of the class again with `new Class(fields)`. It has only the fields object from the wire, so the constructor must accept that object as its only parameter. `registry()` checks this signature at compile time.

The check covers the signature, not the behavior. After deserialization, an instance holds only what its constructor builds from the wire fields. State that the constructor does not receive is lost, such as a field stored under another name, or a value that a constructor with no parameters computes itself. A constructor that sets a default message, or normalizes its fields, runs again on deserialization, and gives the same result. To give callers a shorter form, add a static factory and keep the constructor as it is.

## Why fields live in their own object

A fault has methods, such as `withMeta` and `flatten`, and envelope properties, such as `message` and `cause`. If fields were properties of the fault itself, a field called `message` or `flatten` would hide a real property or method. Every new method would also take a name away from fields, and wire data from another service could replace a method.

So fields live in `fault.fields`, and in a `fields` object on the wire. Any name works as a field, including `message`, `flatten`, and `__proto__`. Adding a method to `Fault` never changes which field names work, and never changes the wire format. The one name that a subclass must not redeclare is `fields` itself.

## Why chains stop at 100 causes

A cause chain can be very long, or it can loop back to itself. Traversal, serialization, and deserialization all stop after 100 nested causes, so a bad chain cannot overflow the stack. Native `Error.cause` links count against the same limit as fault causes.

## When not to use the package

- A small script or a one-off CLI rarely needs to classify errors. A plain `throw new Error()` is enough.
- If your codebase already uses tagged errors, such as Effect errors, a second system adds nothing.
- The package works best when a team defines a set of fault classes and keeps it up to date. If that is too much work for your project, use plain errors.
- Each fault is a class instance. That cost is small, but it can matter when errors are part of expected control flow at a high rate, such as validation in a tight loop.
