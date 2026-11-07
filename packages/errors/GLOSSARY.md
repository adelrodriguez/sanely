# `@sanely/errors` Context

## Domain Glossary

- **Fault**: An `Error` subclass with a stable string `_tag`, fluent context methods, cause-chain helpers, and wire serialization.
- **Message**: The `message` of a fault, written for the user.
- **Description**: The `description` of a fault. It describes the error and what happened, for debugging.
- **Tag**: The string discriminant stored in `_tag`. Tags identify fault variants for matching and registry lookup.
- **Tagged fault**: A `Fault` subclass created by `Tagged(tag)<Fields>()`. Its constructor fields become typed payload fields.
- **Registry**: A constructor-identity-scoped collection created by `registry()`. It creates, wraps, matches, serializes, and reconstructs its registered fault union.
- **Payload field**: A user-defined own property outside the canonical Fault fields and methods.
- **Reserved key**: A key payload data cannot use directly: a wire envelope key or anything reachable through Fault's prototype chain (methods, inherited built-ins, `__proto__`). One predicate (`isReservedKey`) defines this for construction, serialization, and deserialization.
- **Wire format**: A plain `SerializableFault` object marked with `__fault: true`. The marker belongs to serialized data, not registry objects.
- **Cause chain**: The sequence from the current fault (head) toward the original cause (leaf).

See the [architecture](docs/architecture.md) for module ownership and compatibility constraints.
