# How to connect a feature flag provider

This guide shows you how to write the `decide` function that connects a gate factory to your provider.

`decide` receives the flag key, the identity, and an optional `{ signal }`. It must return a decision: `decision.boolean(value)` for a boolean gate, or `decision.variant(variant, payload?)` for a variant gate. A decision of the wrong type, or a variant that the gate does not allow, makes the evaluation return its default.

## LaunchDarkly

```typescript
import { buildGate, decision } from "@sanely/flags"
import * as LaunchDarkly from "launchdarkly-js-client-sdk"

const client = LaunchDarkly.initialize("client-id", { key: "user-key" })

const gate = buildGate({
  identify: () => ({ distinctId: getCurrentUserId() }),
  decide: async (key) => {
    const detail = await client.variationDetail(key, "control")
    return decision.variant(detail.value, detail)
  },
})
```

## PostHog

```typescript
import { buildGate, decision } from "@sanely/flags"
import posthog from "posthog-js"

const gate = buildGate({
  identify: () => ({ distinctId: getCurrentUserId() }),
  decide: (key) => decision.boolean(posthog.isFeatureEnabled(key) ?? false),
})
```

## A custom HTTP API

Pass `signal` to `fetch`, so that a timeout or a cancellation stops the request:

```typescript
import { buildGate, decision } from "@sanely/flags"

const gate = buildGate({
  identify: () => ({ distinctId: user.id }),
  decide: async (key, identity, { signal } = {}) => {
    const response = await fetch(`/api/features/${key}`, {
      method: "POST",
      body: JSON.stringify(identity),
      signal,
    })

    const result = await response.json()
    return decision.boolean(result.enabled)
  },
})
```

## A provider with a batch API

If the provider can evaluate several flags in one request, add `decideMany` too. See [How to evaluate several gates in a batch](./evaluate-a-batch.md).

Refer to the [`buildGate` reference](../reference.md#buildgateconfig) for every option.
