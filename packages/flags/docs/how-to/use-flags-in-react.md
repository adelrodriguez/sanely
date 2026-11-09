# How to use flags in React

This guide shows you how to read flags in React components with `@sanely/flags/react`. The entry point needs React 19.2 or later, and it uses Suspense.

## Read a flag in a component

1. Mount `FlagsProvider` with your reader, above the components that read flags:

   ```tsx
   import { FlagsProvider } from "@sanely/flags/react"
   import { flags } from "./flags/client"

   export function App() {
     return (
       <FlagsProvider flags={flags}>
         <Routes />
       </FlagsProvider>
     )
   }
   ```

   A reader without `identify` needs an `identity` prop, and TypeScript checks it against the reader's identity type.

2. Put a Suspense boundary above each component that reads a flag:

   ```tsx
   import { Suspense } from "react"

   function Home() {
     return (
       <Suspense fallback={<Loading />}>
         <BetaPanel />
       </Suspense>
     )
   }
   ```

3. Pass the flag to `useFlag`:

   ```tsx
   import { useFlag } from "@sanely/flags/react"
   import { betaAccess } from "./flags/definitions"

   function BetaPanel() {
     return useFlag(betaAccess) ? <NewPanel /> : <CurrentPanel />
   }
   ```

To read several flags with one suspension, use `useFlags`:

```tsx
import { useFlags } from "@sanely/flags/react"

function Page() {
  const [hasBetaAccess, selectedTheme] = useFlags([betaAccess, theme])
  return <Dashboard beta={hasBetaAccess} theme={selectedTheme} />
}
```

A hook outside a `FlagsProvider` throws `FlagsProviderMissingError`.

## Render a feature conditionally

Use `FeatureFlag`. When you give `loading`, it adds its own Suspense boundary:

```tsx
import { FeatureFlag } from "@sanely/flags/react"

<FeatureFlag flag={betaAccess} loading={<Loading />} fallback={<CurrentPanel />}>
  <NewPanel />
</FeatureFlag>

<FeatureFlag flag={theme} match="dark">
  <DarkBanner />
</FeatureFlag>
```

A boolean flag matches `true`. A variant flag needs `match`, which TypeScript types to its variants. `FeatureFlag` renders `fallback` when the value does not match, and also when the evaluation falls back to the default.

## Control the flag cache

Each `FlagsProvider` mount keeps its own bounded cache, with a five-minute lifetime by default. To set other limits, pass `cache`:

```tsx
<FlagsProvider flags={flags} cache={{ maxEntries: 250, pendingTtlMs: 30_000, ttlMs: 60_000 }}>
```

To prefetch or invalidate, call `useFlagCache` inside the provider:

```tsx
import { useFlagCache } from "@sanely/flags/react"

function RefreshButton() {
  const cache = useFlagCache()
  return <button onClick={() => cache.invalidate([betaAccess])}>Refresh</button>
}
```

`prefetch(flags)` helps a later `useFlag` or `useFlags` with the same flags in the same order. When the provider has a [`subscribe` function](./write-a-provider.md#report-flag-changes), a change drops the cached values of the changed flags, and the components that read them evaluate again.

To render flags on the server without a loading state, see [How to render flags on the server](./render-flags-on-the-server.md).

Refer to the [React reference](../reference.md#sanelyflagsreact) for every export.
