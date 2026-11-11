<div align="center">
  <h1 align="center">🏰 <code>@sanely/flags</code></h1>

  <p align="center">
    <strong>Type-safe feature flags for TypeScript applications.</strong>
  </p>
</div>

<p align="center">
  Declare flags as values in code, and read them through a provider that you write for LaunchDarkly, PostHog, or any other feature flag service.
</p>

`@sanely/flags` adds a type-safe evaluation layer to your feature flag service. You declare each flag once, write or install a provider, and read flags through a reader. The package manages identity resolution, validation, fallback values, hooks, caching, request coalescing, batches, timeouts, and server snapshots.

The package works in browsers and servers. React support is an optional entry point.

## Features

- **Flags as code.** Each flag is a value with its key and default, so your editor can find every read.
- **Type-safe flags.** TypeScript infers boolean values, string variants, and payload types.
- **Any provider.** Write a provider with `defineProvider`, and switch providers without a change to read sites.
- **Safe fallback.** A failed evaluation returns the default, and its details carry a tagged error.
- **Efficient evaluation.** Store decisions, coalesce requests, or read several flags in one request.
- **Server rendering.** Render with a server snapshot and hydrate with no mismatch.
- **React support.** Use flags with React 19 and Suspense.
- **Test helpers.** Set flag values in tests with a fake provider.
- **No external dependencies.** The only runtime dependency is [`@sanely/duration`](../duration), which reads time expressions such as `"500ms"`. Install React only when your application needs it.

## Install

```sh
npm install @sanely/flags
```

The package needs Node.js 22 or later on the server. The React entry point needs React 19.2 or later.

## Get started

1. Declare your flags in a module that imports only `@sanely/flags`:

   ```typescript
   // flags/definitions.ts
   import { flag } from "@sanely/flags"

   export const betaAccess = flag.boolean("beta-access", false)
   export const theme = flag.variant("theme", ["light", "dark", "system"], "light")
   ```

2. Write a provider for your feature flag service:

   ```typescript
   import { decision, defineProvider, type Identity } from "@sanely/flags"

   export const provider = defineProvider({
     name: "my-service",
     decideOne: async (flag, identity: Identity) => {
       const result = await service.evaluate(flag.key, identity.distinctId)
       return flag.kind === "boolean"
         ? decision.boolean(result.enabled)
         : decision.variant(result.variant)
     },
   })
   ```

3. Create a reader, and read your flags:

   ```typescript
   import { createFlags } from "@sanely/flags"

   const flags = createFlags({ provider, identify: () => ({ distinctId: getCurrentUserId() }) })

   if (await flags.get(betaAccess)) {
     showBetaFeatures()
   }

   const [hasBeta, selectedTheme] = await flags.getMany([betaAccess, theme])
   ```

`flags.get(betaAccess)` returns `false` when identity resolution or the provider fails, so your application continues with a known value.

## Documentation

How-to guides:

- [How to share flag definitions between server and client](docs/how-to/share-flag-definitions.md)
- [How to write a provider with `defineProvider`](docs/how-to/write-a-provider.md)
- [How to supply an identity](docs/how-to/supply-an-identity.md)
- [How to use variant flags and evaluation details](docs/how-to/use-variants-and-details.md)
- [How to read several flags at once](docs/how-to/read-several-flags.md)
- [How to set timeouts and cancel evaluations](docs/how-to/set-timeouts-and-cancel.md)
- [How to observe evaluations with hooks](docs/how-to/observe-evaluations-with-hooks.md)
- [How to cache provider decisions](docs/how-to/cache-provider-decisions.md)
- [How to use flags in React](docs/how-to/use-flags-in-react.md)
- [How to render flags on the server](docs/how-to/render-flags-on-the-server.md)
- [How to test code that uses a flag](docs/how-to/test-a-flag.md)

Reference:

- [`@sanely/flags` reference](docs/reference.md)

Explanation:

- [About flag evaluation](docs/explanation/about-flag-evaluation.md)

To work on the package, read [CONTRIBUTING.md](CONTRIBUTING.md). To report a vulnerability, read [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](../../LICENSE).
