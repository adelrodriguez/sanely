# How to wrap an error and read its cause chain

This guide shows you how to wrap a caught error in a fault, and how to read the chain of causes when you handle it.

## Wrap a caught error

Wrap the caught value with the registry, and give it a tag:

```ts
async function getUser(id: string) {
  let row: { id: string; name: string } | undefined

  try {
    row = await db.query("SELECT * FROM users WHERE id = ?", [id])
  } catch (error) {
    throw AppFault.wrap(error).as("DatabaseError")
  }

  if (!row) {
    throw AppFault.create("NotFoundError", { resource: "user", id })
  }

  return row
}
```

`wrap(error).as(tag, fields?)` creates the fault and sets the caught value as its `cause`. The caught value can be an `Error`, a string, or another value. Without a registry, call `.withCause(error)` on a new fault.

## Read the chain

The chain goes from the head, the newest fault, to the leaf, the original cause. It follows native `Error.cause` links too.

```ts
const root = new Error("db down")
const inner = new TimeoutError()
  .withMessage("Service unavailable")
  .withDescription("Upstream timeout after 30s")
  .withCause(root)
const outer = new NotFoundError({ resource: "user", id: "123" })
  .withMessage("User not found")
  .withDescription("Lookup failed after retries")
  .withCause(inner)

outer.unwrap() // [outer, inner, root]
outer.getTags() // ["NotFoundError", "TimeoutError"]
outer.getContext() // the meta of every fault in the chain, and the head wins a conflict
```

## Find one fault in the chain

To get a typed fault from the chain, search by class with `findCause`, or by tag with the registry:

```ts
import * as Fault from "@sanely/errors"

Fault.findCause(outer, TimeoutError) // inner, typed as TimeoutError | undefined
AppFault.findCause(error, "NotFoundError") // NotFoundError | undefined
```

Both search from the head, and include the head. The registry version skips a fault from another class with the same tag.

## Write the chain to a log

Use `flatten` to join the chain into one string:

```ts
outer.flatten()
// "User not found -> Service unavailable -> db down"

outer.flatten({ field: "description" })
// "Lookup failed after retries -> Upstream timeout after 30s"

outer.flatten({ field: "description", separator: " | ", formatter: (value) => value.toUpperCase() })
// "LOOKUP FAILED AFTER RETRIES | UPSTREAM TIMEOUT AFTER 30S"
```

Refer to the [`flatten` reference](../reference.md#flattenoptions) for the options.
