# Architecture

`@sanely/errors` has one Fault domain, so its implementation stays flat in `src/lib/`.
The public entry points are `src/index.ts`, `src/errors.ts`, and `src/types.ts`.
These files select the published exports. They do not create another copy of an error class or state map.

## Module ownership

| Module        | Ownership                                                                               |
| ------------- | --------------------------------------------------------------------------------------- |
| `wire.ts`     | Wire types, envelope keys, depth limit, payload fields, and thrown-value normalization. |
| `fault.ts`    | Fault instances, cause traversal, encoding, original stacks, and reserved-key checks.   |
| `errors.ts`   | The package's tagged error classes.                                                     |
| `tagged.ts`   | Tagged subclass construction and payload-field rejection.                               |
| `match.ts`    | Tag dispatch and standalone matching signatures.                                        |
| `reviver.ts`  | Envelope validation, payload restoration, and generic reconstruction.                   |
| `registry.ts` | Constructor membership, registered reconstruction, matching, and composition.           |

`wire` imports no other module. `fault` uses `wire`. The error classes and matching types use `fault`.
Tagged construction and reconstruction build on those modules. The registry sits above reconstruction and matching.
The root lint configuration rejects imports from `lib/` into public entry points and checks cycles, including type imports.

## State and compatibility

Fault instances own their data. `fault.ts` owns the original-stack `WeakMap`, and `tagged.ts` owns the `WeakMap` of the fields each `Tagged` constructor assigned.
Registry closures own their constructor maps, and `registry.ts` owns the registry-composition `WeakMap`.

- Registry membership uses constructor identity, not only `_tag`. A foreign Fault with the same tag is not a registry member.
- Registry composition is statically known: `merge()` requires at least two tuple entries so it can preserve per-tag constructor inference. Dynamically sized arrays are intentionally unsupported.
- Standalone matching accepts a typed Fault union. Registry matching accepts `unknown`, checks membership, then uses the same tag dispatch.
- `Fault.toSerializable()` encodes a fault. `fromSerializable()` reconstructs a generic Fault, while `registry.fromSerializable()` restores registered subclasses when possible.
- Registry reconstruction calls the registered constructor with the payload fields object. `registry()` therefore rejects, at the type level, constructors that do not take the fields object as their only parameter; call-site sugar belongs in static factories.
- Subclass field definitions run after the `Tagged` constructor, so a field initializer or a redeclared field can overwrite an assigned field. Registry reconstruction re-applies the fields the `Tagged` constructor assigned after construction. A subclass that normalizes its fields before `super()` keeps the normalized values.
- Generic and registry reconstruction share one validator, payload restoration, and cause recursion. Both accept `unknown` and check the envelope and every cause before they build anything. A malformed value throws `InvalidPayloadError`, whose reason names the depth of a bad cause. `isSerializableFault()` uses the same validator, so `true` means `fromSerializable()` accepts the value.
- Reserved keys follow one rule with two policies: `Tagged` construction rejects them (`ReservedFieldError`), while deserialization renames colliding wire keys with repeated `__payload_` prefixes until safe and unique (wire data must not be dropped).
- Cause traversal and serialization stop after 100 nested fault edges. Deserialization rejects a deeper chain, because the serializer never writes one.
- `unwrap()` and related helpers order chains from head to leaf. Metadata merging gives the head precedence. `findCause()` and `registry.findCause()` return the first match from the head, which includes the head itself.
- Cause traversal and the wire format follow native `Error.cause` links as well as Fault causes, so Faults below a native error stay visible. Both kinds of edge share the 100-edge budget.

See the [package structure rules](../../../docs/agents/package-structure.md) and [test requirements](testing.md).
