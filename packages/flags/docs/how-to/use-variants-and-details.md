# How to use variant gates and evaluation details

This guide shows you how to evaluate a gate that returns one of several string values, and how to read why a gate returned its value.

## Create a variant gate

Give the gate a list of `variants`, and a `defaultValue` from that list:

```typescript
const theme = gate({
  key: "theme",
  defaultValue: "light",
  variants: ["light", "dark", "system"],
})

const selectedTheme = await theme() // "light" | "dark" | "system"
```

TypeScript checks that the default is in `variants`. At run time, a default that is not in `variants` throws a `RangeError` when you create the gate.

In `decide`, return a variant decision for this gate:

```typescript
import { decision } from "@sanely/flags"

decision.variant("dark", { experiment: "checkout-theme" })
```

## Read the evaluation details

Call `details()` when you need more than the value:

```typescript
const result = await betaAccess.details()

result.value
result.flagKey
result.source // "cache" | "provider" | "default"

if (result.source === "default") {
  reportEvaluationError(result.error)
}
```

`details()` does not reject. When evaluation fails, it returns the default value and the original error.

## Type the variant payload

A variant decision can carry a payload. To type it, give the payload type when you create the gate:

```typescript
type ThemePayload = {
  experiment: string
}

const theme = gate<ThemePayload>({
  key: "theme",
  defaultValue: "light",
  variants: ["light", "dark"],
})

const result = await theme.details()
result.payload?.experiment // string | undefined
```

The package does not validate the payload at run time. Without a payload type, the payload type is `unknown`.

When you give the payload type, TypeScript does not infer the variants, so the value type of the gate is `string`, not `"light" | "dark"`.

Refer to the [`EvaluationDetails` reference](../reference.md#evaluationdetails) for every field.
