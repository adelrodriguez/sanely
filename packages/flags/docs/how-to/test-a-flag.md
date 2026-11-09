# How to test code that uses a flag

This guide shows you how to control flag values in a test with `@sanely/flags/testing`.

## Set flag values with a fake provider

1. Create a reader with `fakeProvider` and the values that the test needs:

   ```typescript
   import { createFlags } from "@sanely/flags"
   import { fakeProvider } from "@sanely/flags/testing"
   import { betaAccess, theme } from "./flags/definitions"

   const provider = fakeProvider([
     [betaAccess, true],
     [theme, "dark"],
   ])
   const flags = createFlags({ provider, identify: () => ({ distinctId: "test-user" }) })
   ```

   TypeScript checks each value against its flag, so `[theme, "blue"]` does not compile.

2. Pass the reader to the code under test, and assert on its behavior:

   ```typescript
   expect(await flags.get(theme)).toBe("dark")
   ```

A flag without a value returns its default with an `InvalidDecisionError`.

## Change a value during a test

Call `set`. It changes the value and notifies the reader's change listeners, as a provider change would:

```typescript
provider.set(betaAccess, false)
```

To give a variant a payload, pass it as the third value: `[theme, "dark", { accent: "#000" }]` or `provider.set(theme, "dark", { accent: "#000" })`.

## Test the fallback

To test the default path, use a provider that throws, and read the details:

```typescript
import { createFlags, defineProvider } from "@sanely/flags"

const failing = defineProvider({
  name: "failing",
  decideOne: () => {
    throw new Error("provider down")
  },
})

const details = await createFlags({ provider: failing, identify }).details(betaAccess)
// details.source is "default", and details.error._tag is "ProviderFailedError"
```

## Test code that uses a store

Use `memoryStore` to keep decisions in memory:

```typescript
import { memoryStore } from "@sanely/flags/testing"

const flags = createFlags({ provider, identify, cache: { store: memoryStore() } })
```
