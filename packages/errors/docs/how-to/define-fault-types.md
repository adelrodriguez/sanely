# How to define fault types and group them in a registry

This guide shows you how to declare the errors of your app as fault classes, and group them in a registry that creates and matches them by tag.

1. Declare one class for each kind of failure with `Tagged(tag)<Fields>()`. Use the class name as the tag:

   ```ts
   import * as Fault from "@sanely/errors"

   class ValidationError extends Fault.Tagged("ValidationError")<{ field: string }>() {}
   class NotFoundError extends Fault.Tagged("NotFoundError")<{ resource: string; id: string }>() {}
   class TimeoutError extends Fault.Tagged("TimeoutError")() {}
   ```

   Leave the type argument out when the fault has no fields. Field types must be JSON-safe values. Use a type alias or an inline type for the fields, not an interface.

2. Make sure that no field name is reserved, such as `message`, `cause`, or a method name like `withMeta`. A reserved field name throws `ReservedFieldError` when you create the fault. Refer to [Reserved keys](../reference.md#reserved-keys) for the full list.

3. Group the classes in a registry. Each key must be the tag of its class:

   ```ts
   import * as Fault from "@sanely/errors"

   export const AppFault = Fault.registry({ ValidationError, NotFoundError, TimeoutError })

   export type AppError = typeof AppFault.Type // ValidationError | NotFoundError | TimeoutError
   ```

   A key that is not the tag of its class throws `RegistryTagMismatchError`.

4. Create faults through the registry, and add the messages and metadata:

   ```ts
   throw AppFault.create("NotFoundError", { resource: "user", id: "123" })
     .withDescription("User not found", "Lookup returned 0 rows")
     .withMeta({ traceId: "trace-123" })
   ```

   `new NotFoundError({ resource: "user", id: "123" })` creates the same fault.

## Combine the registries of several modules

If each module has its own registry, merge them:

```ts
import * as Fault from "@sanely/errors"

export const AppFault = Fault.merge(AuthFault, BillingFault)
```

`merge` takes at least two registries. If two registries use the same tag for different classes, `merge` throws `RegistryMergeConflictError` from `@sanely/errors/errors`.

## Set a default message

To give a fault a default message, set it in the constructor. The constructor must take the fields object as its only parameter, because a registry calls it with that object when it reads a serialized fault. For a shorter call, add a static factory:

```ts
class UserNotFound extends Fault.Tagged("UserNotFound")<{ id: string }>() {
  constructor(fields: { id: string }) {
    super(fields)
    this.message = `User ${fields.id} not found`
  }

  static forId(id: string) {
    return new UserNotFound({ id })
  }
}

UserNotFound.forId("7").message // "User 7 not found"
```

`registry()` refuses a class with another constructor signature at compile time. [Why registered constructors take only their fields](../explanation/about-faults.md#why-registered-constructors-take-only-their-fields) explains the rule.
