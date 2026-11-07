# How to test code that uses a gate

This guide shows you how to control the value of a gate in a test.

## Override the identity

To evaluate a real gate for a test user, pass the identity in the call:

```typescript
const result = await betaAccess({
  identity: { distinctId: "test-user" },
})
```

## Use a test provider

To control the decisions, create a gate factory with a `decide` function that returns fixed decisions:

```typescript
import { buildGate, decision } from "@sanely/flags"

const testGate = buildGate({
  identify: () => ({ distinctId: "test-user" }),
  decide: (key) => decision.boolean(key === "beta-access"),
})

const betaAccess = testGate({ key: "beta-access", defaultValue: false })

await betaAccess() // true
```

## Test the fallback

To test the default path, make `decide` throw, and read the details:

```typescript
const failingGate = buildGate({
  identify: () => ({ distinctId: "test-user" }),
  decide: () => {
    throw new Error("provider down")
  },
})

const details = await failingGate({ key: "beta-access", defaultValue: false }).details()

details.source // "default"
details.error.message // "provider down"
```
