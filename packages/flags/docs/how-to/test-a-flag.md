# How to test code that uses a flag

This guide shows you how to control the value of a flag in a test.

## Override the identity

To evaluate a real flag for a test user, pass the identity in the call:

```typescript
const result = await betaAccess({
  identity: { distinctId: "test-user" },
})
```

## Use a test provider

To control the decisions, create a flag factory with a `decide` function that returns fixed decisions:

```typescript
import { createFlags, decision } from "@sanely/flags"

const testFlag = createFlags({
  identify: () => ({ distinctId: "test-user" }),
  decide: (key) => decision.boolean(key === "beta-access"),
})

const betaAccess = testFlag({ key: "beta-access", defaultValue: false })

await betaAccess() // true
```

## Test the fallback

To test the default path, make `decide` throw, and read the details:

```typescript
const failingFlag = createFlags({
  identify: () => ({ distinctId: "test-user" }),
  decide: () => {
    throw new Error("provider down")
  },
})

const details = await failingFlag({ key: "beta-access", defaultValue: false }).details()

if (details.source === "default") {
  details.error.message // "provider down"
}
```
