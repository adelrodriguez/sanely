# How to use variant flags and evaluation details

This guide shows you how to evaluate a flag that returns one of several strings, read its payload, and find out why a flag returned its value.

## Define a variant flag

Give `flag.variant` the key, the variants, and a default from the variants:

```typescript
import { flag } from "@sanely/flags"

export const theme = flag.variant("theme", ["light", "dark", "system"], "light")

const selected = await flags.get(theme) // "light" | "dark" | "system"
```

TypeScript checks that the default is one of the variants. A default outside the variants also throws `FlagDefinitionError` when the module loads.

## Read a typed payload

1. Add a `payload` parser. Its return type becomes the payload type:

   ```typescript
   type ThemePayload = { accent: string }

   function parseTheme(payload: unknown): ThemePayload {
     if (typeof payload !== "object" || payload === null || !("accent" in payload)) {
       throw new TypeError("Expected a theme payload")
     }
     return { accent: String(payload.accent) }
   }

   export const theme = flag.variant("theme", ["light", "dark"], "light", { payload: parseTheme })
   ```

2. Read the payload from the details:

   ```typescript
   const details = await flags.details(theme)
   if (details.source !== "default") {
     details.payload // ThemePayload | undefined
   }
   ```

`payload` is present only when the provider's decision has one. A parser that throws makes the evaluation return the default with an `InvalidDecisionError`.

## Find out why a flag returned its value

`details` reports where the value came from:

```typescript
const details = await flags.details(betaAccess)

switch (details.source) {
  case "provider":
  case "cache":
    break
  case "default":
    report(details.error)
}
```

When `source` is `"default"`, `error` is an `EvaluationError`. Narrow it by its `_tag`:

| `_tag`                     | Meaning                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------- |
| `"IdentityNotFoundError"`  | No identity was found.                                                             |
| `"InvalidDecisionError"`   | The decision does not fit the flag. `problem` says how, and `reason` describes it. |
| `"ProviderFailedError"`    | The provider threw. `provider` names it, and `cause` holds the error.              |
| `"EvaluationTimeoutError"` | The deadline passed.                                                               |
| `"EvaluationAbortedError"` | The caller's signal aborted.                                                       |

`details` never rejects, so no call site needs a `try` block.
