# How to use flags in React

This guide shows you how to read flags in React components with `@sanely/flags/react`. The entry point needs React 19.2 or later, and it uses Suspense.

## Read a flag in a component

1. Pass an evaluator to `useFlag`:

   ```tsx
   import { useFlag } from "@sanely/flags/react"

   function BetaPanel() {
     const enabled = useFlag(betaAccess)
     return enabled ? <NewPanel /> : <CurrentPanel />
   }
   ```

2. Put a Suspense boundary above each component that calls a flag hook:

   ```tsx
   import { Suspense } from "react"

   export function App() {
     return (
       <Suspense fallback={<Loading />}>
         <BetaPanel />
       </Suspense>
     )
   }
   ```

To evaluate several flags with one suspension, use `useFlagBatch`:

```tsx
import { useFlagBatch } from "@sanely/flags/react"

function Page() {
  const [hasBetaAccess, selectedTheme] = useFlagBatch([betaAccess, theme])
  return <Dashboard beta={hasBetaAccess} theme={selectedTheme} />
}
```

To read the details, pass `{ details: true }`: `useFlag(betaAccess, { details: true })`.

## Render a feature conditionally

Use `FeatureFlag`. When you give `loading`, it adds its own Suspense boundary:

```tsx
import { FeatureFlag } from "@sanely/flags/react"

function App() {
  return (
    <FeatureFlag flag={betaAccess} loading={<Loading />} fallback={<CurrentPanel />}>
      <NewPanel />
    </FeatureFlag>
  )
}
```

A boolean flag matches `true` by default. A variant flag needs a `match` prop, such as `match="dark"`.

## Supply the identity from a provider

Mount `FlagProvider` with an identity. Flag hooks below it use that identity when you do not pass one:

```tsx
import { FlagProvider } from "@sanely/flags/react"

function App() {
  return (
    <FlagProvider identity={{ distinctId: user.id }}>
      <Routes />
    </FlagProvider>
  )
}
```

TypeScript does not check the identity of a plain `FlagProvider`. To check it against the identity type of your flags, create the provider and the hooks from the factory:

```tsx
import { createFlagHooks } from "@sanely/flags/react"

const flag = createFlags({
  identify: async () => {
    const user = await getCurrentUser()
    return { distinctId: user.id, plan: user.plan }
  },
  decide,
})

export const { FlagProvider, useFlag, useFlagBatch } = createFlagHooks(flag)
```

The provider from `createFlagHooks` then requires `distinctId` and `plan`, and its hooks accept only flags with the same identity type and call mode. These hooks read the identity only from their own provider. Under a plain `FlagProvider`, they use `identify` from the factory.

A factory without `identify` needs a type argument, such as `createFlags<UserIdentity>({ decide })`.

## Render on the server

All exports of `@sanely/flags/react` are client-only. Mount `FlagProvider` inside the client boundary, and above the Suspense boundaries that hold flag consumers. Each mount of a provider without a `cache` prop creates its own cache, so requests do not share cached values. A client-only application does not need `FlagProvider`.

## Control the flag cache

React evaluations use a bounded promise cache, with a five-minute lifetime by default. To set other limits, prefetch, or invalidate, create a cache and pass it to the provider:

```tsx
import { createFlagCache, FlagProvider } from "@sanely/flags/react"

const cache = createFlagCache({ maxEntries: 250, pendingTtlMs: 30_000, ttlMs: 60_000 })

cache.prefetch(betaAccess, { identity: user })
cache.invalidate(betaAccess, user)
cache.clear()

function App() {
  return (
    <FlagProvider cache={cache} identity={{ distinctId: user.id }}>
      <Routes />
    </FlagProvider>
  )
}
```

A cache that you use directly cannot read a provider identity, so give an explicit identity to its methods. Inside the provider, `useFlagCache()` returns the active cache, and its methods use the provider identity when you leave the identity out:

```tsx
import { useFlagCache } from "@sanely/flags/react"

function RefreshButton() {
  const cache = useFlagCache()
  return <button onClick={() => cache.invalidate(betaAccess)}>Refresh</button>
}
```

When the factory has a [`subscribe` function](./cache-provider-decisions.md#drop-decisions-when-the-provider-changes-a-flag), a provider change invalidates the matching entries, and the components that read those flags evaluate again. Entries from `prefetch` and `prefetchBatch`, and entries that no mounted component reads, evaluate again on their next read.

An identity in a cache key can hold strings, numbers, booleans, `null`, `undefined`, arrays, and plain records with string keys. Other values, such as `Date`, `Map`, symbols, functions, bigints, and circular references, throw a `TypeError`.

Refer to the [React reference](../reference.md#sanelyflagsreact) for every export.
