# About faults, registries, and the wire format

This page explains the ideas behind `@sanely/errors`: what a fault carries, why registries check classes and not only tags, and why the wire format has the rules that it has.

## A fault carries a message, a description, and two kinds of data

A plain `Error` has one message, and that message often goes to two readers. The user needs a short statement, such as "User not found". The developer who debugs the failure needs to know what happened, such as "DB query returned 0 rows". A fault keeps these apart: `message` is for the user, and `description` describes the error and what happened, for debugging.

A fault also carries two kinds of data. Its fields, such as `id`, belong to the kind of failure, and the type of the class declares them. Its `meta`, such as `{ traceId }`, belongs to the place where the failure happened, and any code can add it with `withMeta`. `getContext()` merges the `meta` of every fault in a cause chain. The head wins a conflict, because the newest fault knows the most about the current request.

## Why `Tagged` takes two calls

`Tagged("NotFoundError")<{ id: string }>()` looks unusual. TypeScript cannot infer one type argument and take another from you in the same call. The first call infers the tag as a literal type, and the second call takes the field type. With one call, you would have to write the tag twice.

## A tag is a name, and a class is an identity

Each fault has a string tag in `_tag`. Tags make matching easy, and they survive serialization. But two libraries can both define a `NotFoundError`. If a registry matched only by tag, a fault from another library could reach a handler that expects fields that the fault does not have.

So a registry checks the class too. `is`, `findCause`, `matchTag`, and `matchTags` on a registry accept a value only when it is an instance of the registered class with the registered tag. The standalone `matchTag` and `matchTags` do not check membership. They take a value that already has a fault union type, and TypeScript has checked that type.

For the same reason, `merge` refuses one tag for two different classes, and `merge` takes a list with a known length. TypeScript can then keep the class type of each tag in the merged registry.

## Why registered constructors take only their fields

A registry reads a serialized fault and builds an instance of the class again with `new Class(fields)`. It has only the fields object from the wire, so the constructor must accept that object as its only parameter. `registry()` checks this signature at compile time.

The check covers the signature, not the behavior. After deserialization, an instance holds only what its constructor builds from the payload fields. State that the constructor does not receive is lost, such as a field stored under another name, or a value that a constructor with no parameters computes itself. A constructor that sets a default message, or normalizes its fields, runs again on deserialization, and gives the same result. To give callers a shorter form, add a static factory and keep the constructor as it is.

## One rule for reserved keys, with two policies

Fields become own properties of the fault, and serialized fields sit next to the envelope keys. A field called `message` or `withMeta` would hide a real property or method. So one predicate decides which keys are reserved, and every part of the package uses it.

The rule has two policies. Construction rejects a reserved field, because your own code can choose another name. The type checker rejects the class declaration, and the constructor throws `ReservedFieldError` for a key the types cannot see. Deserialization cannot reject wire data that another service sent, and it must not drop the data either. So it renames a colliding key with the prefix `__payload_`, and repeats the prefix until the name is unique.

## Why chains stop at 100 causes

A cause chain can be very long, or it can loop back to itself. Traversal, serialization, and deserialization all stop after 100 nested causes, so a bad chain cannot overflow the stack. Native `Error.cause` links count against the same limit as fault causes.

## When not to use the package

- A small script or a one-off CLI rarely needs to classify errors. A plain `throw new Error()` is enough.
- If your codebase already uses tagged errors, such as Effect errors, a second system adds nothing.
- The package works best when a team defines a set of fault classes and keeps it up to date. If that is too much work for your project, use plain errors.
- Each fault is a class instance. That cost is small, but it can matter when errors are part of expected control flow at a high rate, such as validation in a tight loop.
