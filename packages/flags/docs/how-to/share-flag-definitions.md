# How to share flag definitions between server and client

This guide shows you how to declare each flag once and read it on the server and in the browser, each with its own provider and identity.

1. Declare the flags in a module that imports only `@sanely/flags`:

   ```typescript
   // flags/definitions.ts
   import { flag } from "@sanely/flags"

   export const betaAccess = flag.boolean("beta-access", false)
   export const theme = flag.variant("theme", ["light", "dark", "system"], "light", {
     payload: parseTheme,
   })
   ```

   A flag definition holds its key, default, variants, payload parser, and timeout. It has no provider and no identity, so both runtimes can import it.

2. Create a server reader. A server has no ambient user, so leave out `identify`, and read through `for`:

   ```typescript
   // flags/server.ts
   import { createFlags } from "@sanely/flags"

   export const serverFlags = createFlags({ provider: launchDarkly(ldClient) })
   ```

3. Create a client reader with the browser's provider and identity:

   ```typescript
   // flags/client.ts
   import { createFlags } from "@sanely/flags"

   export const flags = createFlags({
     provider: serverBacked("/api/flags"),
     identify: getCurrentUser,
   })
   ```

   [How to render flags on the server](./render-flags-on-the-server.md#read-later-flags-through-the-server) shows how to write `serverBacked`.

4. Read the same flag values in both places:

   ```typescript
   // A request handler on the server
   const enabled = await serverFlags.for(request.user).get(betaAccess)

   // A browser module
   const look = await flags.get(theme)
   ```

Because a flag is a value, your editor's "Find all references" lists every place that reads it, and go-to-definition jumps to its declaration.

Two flags with the same key ask the provider about the same provider flag. Keep one definition for each key.
