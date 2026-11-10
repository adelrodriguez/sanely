# How to handle faults by tag

This guide shows you how to run different code for each kind of fault, such as a status code for each error in an HTTP handler.

## Handle a caught value

A caught value has the type `unknown`. Match it with the registry, which first checks that the value is a fault of a registered class:

```ts
function toHttpStatus(error: unknown) {
  return AppFault.matchTags(
    error,
    {
      NotFoundError: () => 404,
      ValidationError: () => 422,
      DatabaseError: () => 503,
    },
    () => 500
  )
}
```

The fallback receives the original value as `unknown`. Without a fallback, a value that is not a registered fault returns `undefined`.

To handle one tag, use `matchTag`:

```ts
const action = AppFault.matchTag(
  error,
  "TimeoutError",
  () => "retry",
  () => "ignore"
)
```

To check membership only, use `AppFault.is(error)`.

## Handle a typed fault union

If the value already has a fault union type, use the standalone `matchTag` and `matchTags`. TypeScript narrows each handler to its fault type. `matchTags` accepts a partial handler map, and without a fallback, a tag that has no handler returns `undefined`. The fallback of `matchTag` receives the other types of the union:

```ts
import * as Fault from "@sanely/errors"

declare const error: NotFoundError | TimeoutError

const result = Fault.matchTags(error, {
  NotFoundError: () => ({ status: 404 }),
  TimeoutError: () => ({ status: 503 }),
})

const action = Fault.matchTag(
  error,
  "TimeoutError",
  () => "retry",
  (other) => other.fields.id // other is NotFoundError
)
```

Refer to the [registry reference](../reference.md#registry) for the registry matchers, and to the [matching reference](../reference.md#matching) for the standalone ones.
