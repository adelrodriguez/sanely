# How to send faults across a boundary

This guide shows you how to send a fault from a server to a client, or between processes, and get a fault of the same class on the other side.

1. On the sending side, serialize the caught value:

   ```ts
   const payload = AppFault.toSerializable(error)
   res.json(payload)
   ```

   `toSerializable` accepts any caught value. A native `Error` becomes a fault with the tag `UnknownError`, and any other value becomes a fault with the tag `UnknownThrown`.

2. On the receiving side, check the value before you read it, if it comes from a source that you do not control:

   ```ts
   import { isSerializableFault } from "@sanely/errors"

   if (!isSerializableFault(payload)) {
     throw new Error("The response is not a serialized fault")
   }
   ```

   When `isSerializableFault` returns `true`, `fromSerializable` accepts the value.

3. Build the fault again with the same registry:

   ```ts
   const fault = AppFault.fromSerializable(payload)

   fault instanceof NotFoundError // true, when the tag is NotFoundError
   ```

   A tag that the registry does not have becomes a generic `Fault`. A malformed value throws `InvalidPayloadError` from `@sanely/errors/errors`, and its `reason` names the check that failed.

## If the receiver has no registry

Use the standalone `fromSerializable`. It builds a generic `Fault` with the tag, the messages, the metadata, the fields, and the causes, but not the subclass:

```ts
import { fromSerializable } from "@sanely/errors"

const fault = fromSerializable(payload)
fault._tag // "NotFoundError"
```

## If the transport is JSON

JSON drops object properties whose value is `undefined`, and turns `undefined` in an array into `null`. A structured-clone transport, such as `postMessage`, keeps them. The other values of a fault are JSON-safe by type.

`JSON.stringify(fault)` also works, because a fault's `toJSON` returns its serialized form.

Refer to the [wire format reference](../reference.md#wire-format) for the fields of the serialized object.
