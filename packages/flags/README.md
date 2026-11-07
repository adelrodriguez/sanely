<p align="center">
  <h1 align="center">🏰 <code>@sanely/flags</code></h1>
  <p align="center">
    <strong>Type-safe feature flags for TypeScript applications.</strong>
  </p>
</p>

<p align="center">
  Use one API with LaunchDarkly, PostHog, or your own feature flag provider.
</p>

`@sanely/flags` adds a type-safe evaluation layer to your feature flag provider. You supply the identity and the provider decision. The package manages validation, fallback values, hooks, caching, request coalescing, batches, and timeouts.

The package works in browsers and servers. React support is an optional entry point.

## Features

- **Type-safe gates.** TypeScript infers boolean values and string variant values.
- **One API for any provider.** Connect a provider through one `decide` function.
- **Safe fallback.** A failed evaluation returns the configured default.
- **Evaluation details.** Read the decision source, the payload, and the fallback error.
- **Efficient evaluation.** Cache decisions, coalesce requests, or evaluate a batch.
- **Lifecycle hooks.** Observe evaluation without a change to its result.
- **React support.** Use gates with React 19, Suspense, and a bounded gate cache.
- **No core runtime dependencies.** Install React only when your application needs it.

## Install

```sh
npm install @sanely/flags
```

The package needs Node.js 22 or later on the server. The React entry point needs React 19.2 or later.

## Get started

First, create a gate factory. The factory connects the package to your identity source and your feature flag provider:

```typescript
import { buildGate, decision } from "@sanely/flags"

const gate = buildGate({
  identify: () => ({ distinctId: getCurrentUserId() }),
  decide: async (key, identity) => {
    const enabled = await provider.isEnabled(key, identity.distinctId)
    return decision.boolean(enabled)
  },
})
```

Next, create and evaluate a boolean gate:

```typescript
const betaAccess = gate({
  key: "beta-access",
  defaultValue: false,
})

if (await betaAccess()) {
  showBetaFeatures()
}
```

`betaAccess()` returns `false` when identity resolution or provider evaluation fails, so your application continues with a known value.

## Documentation

How-to guides:

- [How to connect a feature flag provider](docs/how-to/connect-a-provider.md)
- [How to use variant gates and evaluation details](docs/how-to/use-variants-and-details.md)
- [How to supply an identity](docs/how-to/supply-an-identity.md)
- [How to evaluate several gates in a batch](docs/how-to/evaluate-a-batch.md)
- [How to set timeouts and cancel evaluations](docs/how-to/set-timeouts-and-cancel.md)
- [How to observe evaluations with hooks](docs/how-to/observe-evaluations-with-hooks.md)
- [How to cache provider decisions](docs/how-to/cache-provider-decisions.md)
- [How to use gates in React](docs/how-to/use-gates-in-react.md)
- [How to test code that uses a gate](docs/how-to/test-a-gate.md)

Reference:

- [`@sanely/flags` reference](docs/reference.md)

Explanation:

- [About gate evaluation](docs/explanation/about-gate-evaluation.md)

To work on the package, read [CONTRIBUTING.md](CONTRIBUTING.md). To report a vulnerability, read [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](../../LICENSE).
