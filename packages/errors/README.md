<div align="center">
  <h1 align="center">🦥 <code>@sanely/errors</code></h1>

  <p align="center">
    <strong>Structured, extensible, type-safe error handling for TypeScript</strong>
  </p>

  <p align="center">
    <a href="https://www.npmjs.com/package/@sanely/errors"><img src="https://img.shields.io/npm/v/@sanely/errors" alt="npm version" /></a>
    <a href="../../LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  </p>
</div>

`@sanely/errors` gives each error in your app a class, a string tag, and typed fields. You group the classes in a registry, and then create, wrap, match, and serialize them by tag.

```ts
import * as Fault from "@sanely/errors"

class NotFoundError extends Fault.Tagged("NotFoundError")<{ id: string }>() {}

const fault = new NotFoundError({ id: "123" }).withDescription(
  "User not found",
  "DB query returned 0 rows"
)

fault._tag // "NotFoundError"
fault.id // "123"
fault.message // "User not found", for the user
fault.details // "DB query returned 0 rows", for logs
```

## Features

- **Tagged subclasses.** Each fault type is a real class with a `_tag` discriminant, so `instanceof` works.
- **Typed fields.** Each fault type has its own structured fields.
- **Two messages.** `message` is for the user, and `details` is for logs.
- **Cause chains.** Wrap and throw again, and keep the full chain of causes.
- **Registries.** Group fault types into a union with `create`, `wrap`, and `match` methods.
- **Serialization.** Convert a fault to a plain object, send it, and build it again on the other side.
- **No runtime dependencies.**

## Install

```bash
npm install @sanely/errors
```

The package needs TypeScript 5.4 or later, and Node.js 20 or later.

## Get started

Define fault classes, group them in a registry, and match them by tag:

```ts
import * as Fault from "@sanely/errors"

class NotFoundError extends Fault.Tagged("NotFoundError")<{ id: string }>() {}
class DatabaseError extends Fault.Tagged("DatabaseError")() {}

const AppFault = Fault.registry({ NotFoundError, DatabaseError })

try {
  throw AppFault.create("NotFoundError", { id: "123" }).withMessage("User not found")
} catch (error) {
  AppFault.matchTags(error, {
    NotFoundError: (fault) => console.log(fault.id), // "123", typed as string
    DatabaseError: () => console.log("db failed"),
  })
}
```

## Documentation

How-to guides:

- [How to define fault types and group them in a registry](docs/how-to/define-fault-types.md)
- [How to wrap an error and read its cause chain](docs/how-to/wrap-and-read-causes.md)
- [How to handle faults by tag](docs/how-to/handle-faults-by-tag.md)
- [How to send faults across a boundary](docs/how-to/send-faults-across-a-boundary.md)

Reference:

- [`@sanely/errors` reference](docs/reference.md)

Explanation:

- [About faults, registries, and the wire format](docs/explanation/about-faults.md)

To work on the package, read [CONTRIBUTING.md](CONTRIBUTING.md).

## Acknowledgments

The package is inspired by the [Fault](https://github.com/Southclaws/fault) library.

Made with [🥐 `pastry`](https://github.com/adelrodriguez/pastry).

## License

MIT. See [LICENSE](../../LICENSE).
