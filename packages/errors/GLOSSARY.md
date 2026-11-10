# `@sanely/errors` Context

## Domain Glossary

- **Fault**: An `Error` subclass with a stable string `_tag`, fluent context methods, cause-chain helpers, and wire serialization.
- **Message**: The `message` of a fault, written for the user.
- **Description**: The `description` of a fault. It describes the error and what happened, for debugging.
- **Tag**: The string discriminant stored in `_tag`. Tags identify fault variants for matching and registry lookup.
- **Tagged fault**: A `Fault` subclass created by `Tagged(tag)<Fields>()`. Its constructor fields become the typed fields of the fault.
- **Registry**: A constructor-identity-scoped collection created by `registry()`. It creates, wraps, matches, serializes, and reconstructs its registered fault union.
- **Field**: A typed value in a fault's `fields` object. Fields live in their own object, so a field name never collides with a Fault method or an envelope key.
- **Wire format**: A plain `SerializableFault` object marked with `__fault: true`. Its envelope holds the tag, name, message, description, meta, stack, and cause, and its `fields` object holds the fields. The marker belongs to serialized data, not registry objects.
- **Cause chain**: The sequence from the current fault (head) toward the original cause (leaf).

See the [architecture](docs/architecture.md) for module ownership and compatibility constraints.
