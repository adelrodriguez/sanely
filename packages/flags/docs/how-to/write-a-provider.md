# How to write a provider with `defineProvider`

This guide shows you how to connect `@sanely/flags` to a feature flag service by writing a provider. A provider decides flags for an identity. Write it once, and pass it to each `createFlags` call that uses the service.

## Choose `decideOne` or `decide`

A provider defines exactly one of these methods:

- `decideOne(flag, identity, { signal })` decides one flag. Use it when the SDK evaluates one key at a time. When a reader evaluates several flags, the package calls it once for each flag key.
- `decide(flags, identity, { signal })` decides several flags in one call, and returns a record from flag key to decision. Use it when the service has a bulk API.

Each method receives the flag definitions, so a provider can choose an SDK call from `flag.kind` and pass `flag.defaultValue`. Return `decision.boolean(value)` for a boolean flag, and `decision.variant(variant, payload?)` for a variant flag.

## Write a provider that decides one flag

1. Annotate the `identity` parameter with the identity type that the service needs. `defineProvider` takes the provider's identity type from that annotation:

   ```typescript
   import type { LDClient } from "@launchdarkly/node-server-sdk"
   import { decision, defineProvider, type Identity } from "@sanely/flags"

   type UserIdentity = Identity & { email: string }

   export function launchDarkly(client: LDClient) {
     return defineProvider({
       name: "launchdarkly",
       decideOne: async (flag, identity: UserIdentity) => {
         const context = { kind: "user", key: String(identity.distinctId), email: identity.email }
         return flag.kind === "boolean"
           ? decision.boolean(await client.boolVariation(flag.key, context, flag.defaultValue))
           : decision.variant(await client.stringVariation(flag.key, context, flag.defaultValue))
       },
     })
   }
   ```

2. Pass the provider to `createFlags`. TypeScript then checks `identify` and `for` against `UserIdentity`:

   ```typescript
   const flags = createFlags({ provider: launchDarkly(client), identify: getCurrentUser })
   ```

Without an annotation, the provider's identity type is `Identity`.

## Write a provider with a bulk API

Define `decide` instead of `decideOne`. Pass `signal` to `fetch`, so that a timeout or a cancellation stops the request:

```typescript
export const internalApi = defineProvider({
  name: "internal-api",
  decide: async (flags, identity: UserIdentity, { signal }) => {
    const response = await fetch("/api/features", {
      method: "POST",
      body: JSON.stringify({ keys: flags.map((flag) => flag.key), user: identity.distinctId }),
      signal,
    })
    const result: Record<string, boolean> = await response.json()
    return Object.fromEntries(
      Object.entries(result).map(([key, enabled]) => [key, decision.boolean(enabled)])
    )
  },
})
```

A key that the record leaves out makes that flag return its default with an `InvalidDecisionError`.

## Allow anonymous evaluation

If the service can evaluate without a user, add `Anonymous` to the identity annotation. `identify` can then return `anonymous`:

```typescript
import { anonymous, type Anonymous } from "@sanely/flags"

const provider = defineProvider({
  name: "edge-config",
  decideOne: (flag, identity: UserIdentity | Anonymous) =>
    decision.boolean(identity !== anonymous && rollout.includes(identity.distinctId)),
})
```

## Report flag changes

If the service can push changes, add `subscribe`. The package calls it with a `notify` function and expects a function that detaches:

```typescript
const provider = defineProvider({
  name: "launchdarkly",
  decideOne,
  subscribe: (notify) => {
    const onChange = ({ key }: { key: string }) => notify([key])
    client.on("update", onChange)
    return () => client.off("update", onChange)
  },
})
```

Call `notify(keys)` with the changed flag keys, or `notify()` when any flag may have changed. Later evaluations of those flags no longer join a provider call that is already running. The package also deletes their stored decisions when the store has `deleteFlags`, and calls the reader's `subscribe` listeners.

## Name the provider

`name` appears in `ProviderFailedError` when `decide` or `decideOne` throws. Give each provider a short, distinct name.

`defineProvider` throws `FlagDefinitionError` for an empty name, for both or neither of `decide` and `decideOne`, and for a method that is not a function.

Refer to the [`defineProvider` reference](../reference.md#defineproviderdefinition) for every field.
