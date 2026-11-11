# How to split resolvers across files

A flat resolver map passed to `createRouter` gets hard to read past a dozen channels. Use `implement()` to put each resolver next to the code it belongs with, and assemble the resulting fragments in one place.

1. Create a builder from your contract, and declare the context type on it. This is the only place you write the context type.

   ```typescript
   // contract.ts
   import { implement } from "@sanely/rpc"

   type Session = { userId: string }

   export const tp = implement(contract).$context<Session>()
   ```

   If your resolvers need no context, leave out `.$context<Session>()`.

2. Build each fragment by calling its leaf on the builder with a resolver. TypeScript infers the input, the return type, and the context. You write no annotations.

   ```typescript
   // files/handlers.ts
   import { tp } from "../contract"

   export const open = tp.files.open(async ({ context }) => openFile(context.userId))
   export const save = tp.files.save(async ({ input: { contents, path } }) =>
     saveFile(path, contents)
   )
   ```

3. Pass `createRouter` a handler tree, an object with the same shape as the contract. A namespace import of a module of fragments already has that shape.

   ```typescript
   // router.ts
   import { createRouter } from "@sanely/rpc"
   import * as files from "./files/handlers"
   import { created } from "./stripe/handlers"

   export const router = createRouter(contract, {
     files,
     stripe: { checkout: { created } },
   })
   ```

`createRouter` reads the context type back from the fragments. You don't pass type arguments, and `router.dispatch` requires `{ context: Session }` as its third argument.

## What the compiler catches at assembly

- A missing fragment is a missing property. The error names the leaf.
- A fragment in the wrong slot is a type error. Each fragment carries its dotted path in its type, so `save` can't fill the `open` slot.
- A fragment from another contract is a type error when its leaf has other schema types, even when the paths match.
- A fragment built without `$context` can't join a tree whose other fragments expect a `Session`.

Other exports in a module of fragments, such as helpers, are ignored. The router walks the contract, not the object you pass it.

## Keep a flat map with a context

If you prefer the flat map, fix the context type once and let the contract be inferred:

```typescript
const createSessionRouter = createRouter.$context<Session>()

const router = createSessionRouter(contract, {
  "files.open": async ({ context }) => openFile(context.userId),
  // ...
})
```

Reuse `createSessionRouter` for every contract served by the same edge. It also accepts handler trees whose fragments accept `Session`. Each router's `dispatch` still requires `{ context: Session }`.

The explicit `createRouter<typeof contract, Session>(contract, resolvers)` form still works.

To declare the map away from the `createRouter` call, type it with `InferResolvers<typeof contract, Session>`.

## Serve several routers as one

If each feature has its own contract and router, merge them with `mergeRouters` and give the edge the result:

```typescript
// router.ts
import { mergeRouters } from "@sanely/rpc"
import { filesRouter } from "./files/router"
import { settingsRouter } from "./settings/router"

export const router = mergeRouters(filesRouter, settingsRouter)
```

The merged router needs every context its routers declare. If `filesRouter` needs `{ sender }` and `settingsRouter` needs `{ userId }`, `router.dispatch` needs `{ context: { sender, userId } }`, and each resolver still receives the whole object.

If two routers declare the same channel, `mergeRouters` throws a `SetupError` with code `duplicate-channel` that names the path.
