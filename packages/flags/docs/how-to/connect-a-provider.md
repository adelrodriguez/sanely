# How to connect a feature flag provider

This guide shows you how to write the `decide` function that connects a flag factory to your provider.

`decide` receives the flag key, the identity, and an optional `{ signal }`. It must return a decision: `decision.boolean(value)` for a boolean flag, or `decision.variant(variant, payload?)` for a variant flag. A decision of the wrong type, or a variant that the flag does not allow, makes the evaluation return its default.

## LaunchDarkly

```typescript
import { createFlags, decision } from "@sanely/flags"
import * as LaunchDarkly from "launchdarkly-js-client-sdk"

const client = LaunchDarkly.initialize("client-id", { key: "user-key" })

const flag = createFlags({
  identify: () => ({ distinctId: getCurrentUserId() }),
  decide: async (key) => {
    const detail = await client.variationDetail(key, "control")
    return decision.variant(detail.value, detail)
  },
})
```

## PostHog

```typescript
import { createFlags, decision } from "@sanely/flags"
import posthog from "posthog-js"

const flag = createFlags({
  identify: () => ({ distinctId: getCurrentUserId() }),
  decide: (key) => decision.boolean(posthog.isFeatureEnabled(key) ?? false),
})
```

## A custom HTTP API

Pass `signal` to `fetch`, so that a timeout or a cancellation stops the request:

```typescript
import { createFlags, decision } from "@sanely/flags"

const flag = createFlags({
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

If the provider can evaluate several flags in one request, add `decideMany` too. See [How to evaluate several flags in a batch](./evaluate-a-batch.md).

Refer to the [`createFlags` reference](../reference.md#createflagsconfig) for every option.
