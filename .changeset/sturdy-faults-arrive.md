---
"@sanely/errors": minor
---

Publish `@sanely/errors` as the successor to `faultier`

`@sanely/errors` replaces `faultier@3.2.0`. It keeps tagged fault classes, registries, cause chains, and serialization, and it moves a fault's typed fields into their own `fields` object so that any name works as a field.

To move from `faultier`:

- Read fields from `fault.fields`, as in `fault.fields.id` instead of `fault.id`. Any name works as a field, including `message` and `flatten`, so `ReservedFieldError` is gone.
- The wire format keeps the fields in a `fields` object. A service on `faultier` and a service on `@sanely/errors` cannot revive each other's faults, so move both sides together.
- `details` is now `description`, and `withDetails(details)` is now `withDescription(description)`. `flatten({ field: "details" })` is now `flatten({ field: "description" })`.
- `withDescription` now sets `description`, not `message`. Replace a one-argument `withDescription(message)` with `withMessage(message)`, because it still compiles and would set the wrong property. Replace the two-argument `withDescription(message, details)` with `withMessage(message).withDescription(description)`.
- The base class is exported as `Base`, so you write `Fault.Base` with `import * as Fault from "@sanely/errors"`. `isFault` stays, and `is` is the same function.
- The base constructor takes `(tag, fields?)` instead of `(tag, message?)`. In a class that extends the base class directly, replace `super(tag, message)` with `super(tag)` and set `this.message = message` after it. A class built with `Tagged` sets its message the same way.
- `fromSerializable` and `registry.fromSerializable` accept `unknown`. They check the whole envelope and every cause, and throw `InvalidPayloadError` for a malformed value instead of dropping a bad cause.
- A registry throws `RegistryUnknownTagError`, `RegistryNotRecognizedError`, or `RegistryConstructorError` from `@sanely/errors/errors` where `faultier` threw a plain `TypeError` or `Error`.

New in this release:

- `findCause` finds a fault in a cause chain by class, and the standalone `toSerializable` serializes any caught value.
- `isSerializable` (also exported as `isSerializableFault`) returns `true` exactly when `fromSerializable` accepts a value.
- `registry.toSerializable` types a member's payload by `_tag`, with that member's fields.
- `stack` follows the current message and cause. Assigning `cause` directly now updates the `Caused by:` block, as `withCause` does, and `withMessage` writes the new message into the first line of `stack`. Revived faults keep their serialized stack.
