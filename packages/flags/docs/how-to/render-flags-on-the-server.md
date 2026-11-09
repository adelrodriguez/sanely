# How to render flags on the server

This guide shows you how to evaluate flags once on the server, render with those values, and hydrate on the client with the same values, so the page has no loading state and no hydration mismatch.

It assumes that your flags live in a shared definitions module. See [How to share flag definitions](./share-flag-definitions.md).

## Render with a snapshot

1. On the server, make a snapshot of the flags that the page reads:

   ```typescript
   import { betaAccess, theme } from "./flags/definitions"
   import { serverFlags } from "./flags/server"

   const snapshot = await serverFlags.for(user).snapshot([betaAccess, theme])
   ```

   A snapshot holds plain values, so you can pass it from a server component to a client component or serialize it into the page.

2. Pass the snapshot to `FlagsProvider`, with the same identity:

   ```tsx
   <FlagsProvider flags={flags} identity={user} snapshot={snapshot}>
     <Page />
   </FlagsProvider>
   ```

The first render reads each flag from the snapshot without suspending, on the server and in the browser. The client does not call its provider for those flags.

## Know when the client evaluates again

- When the `identity` prop has another `distinctId` than the snapshot, the provider ignores the snapshot.
- When the provider reports a change for a flag, the snapshot entry of that flag is dropped.
- `useFlagCache().invalidate(flags)` and `clear()` drop snapshot entries too.
- A flag that the snapshot does not have evaluates through the client reader.

`FlagsProvider` reads `snapshot` only when it mounts. A later snapshot prop has no effect.

A snapshot holds no payloads. Read a payload through `details` on the reader.

## Read later flags through the server

After the first render, the client reads flags through its own reader. To keep one evaluator of record, write a provider that calls an endpoint of your application, and let the endpoint run the server reader.

1. Add an endpoint that returns a snapshot for the requested keys and the session's user:

   ```typescript
   // app/api/flags/route.ts
   import { allFlags } from "./flags/definitions"
   import { serverFlags } from "./flags/server"

   const flagsByKey = new Map(allFlags.map((definition) => [definition.key, definition]))

   export async function POST(request: Request) {
     const { keys }: { keys: string[] } = await request.json()
     const requested = keys.flatMap((key) => flagsByKey.get(key) ?? [])
     const snapshot = await serverFlags.for(await getSessionUser(request)).snapshot(requested)
     return Response.json(snapshot.flags)
   }
   ```

   Export `allFlags`, an array of every flag, from the definitions module.

2. Write a client provider that calls the endpoint and turns each entry into a decision:

   ```typescript
   // flags/server-backed.ts
   import { decision, defineProvider, type Decision, type FlagSnapshotEntry } from "@sanely/flags"

   export function serverBacked(endpoint: string) {
     return defineProvider({
       name: "server",
       decide: async (flags, _identity: UserIdentity, { signal }) => {
         const response = await fetch(endpoint, {
           method: "POST",
           headers: { "content-type": "application/json" },
           body: JSON.stringify({ keys: flags.map((definition) => definition.key) }),
           signal,
         })
         if (!response.ok) throw new Error(`The flag endpoint returned ${response.status}`)
         const entries: Record<string, FlagSnapshotEntry> = await response.json()
         const decisions: Record<string, Decision> = {}
         for (const [key, entry] of Object.entries(entries)) {
           if (entry.source === "default") continue
           decisions[key] =
             typeof entry.value === "boolean"
               ? decision.boolean(entry.value)
               : decision.variant(entry.value)
         }
         return decisions
       },
     })
   }
   ```

   The endpoint reads the user from the session, so the provider ignores the client identity. A flag that fell back to its default on the server is left out, so it falls back on the client too.

3. Use the provider in the client reader:

   ```typescript
   export const flags = createFlags({
     provider: serverBacked("/api/flags"),
     identify: getCurrentUser,
   })
   ```

Only the server's provider SDK evaluates flags. An application without server rendering can use a provider SDK in the browser instead.
