# How to read several flags at once

This guide shows you how to evaluate several flags for one operation, with one identity resolution and as few provider requests as possible.

1. Pass the flags to `getMany`. Destructure the result in the order of the flags:

   ```typescript
   const [hasBetaAccess, selectedTheme] = await flags.getMany([betaAccess, theme])
   ```

   TypeScript types the tuple from the flags, here `[boolean, "light" | "dark" | "system"]`.

2. To read the details of each flag, use `detailsMany`:

   ```typescript
   const [betaDetails, themeDetails] = await flags.detailsMany([betaAccess, theme])
   ```

Each flag keeps its own hooks, validation, timeout, fallback value, and details. A decision that does not fit one flag does not change the others. A failure that the flags share, such as a failed identity or a bulk `decide` that throws, makes each of them return its default.

## Know when a batch calls the provider

The flags that need provider work in the same tick share one provider request:

- A provider with `decide` gets one call, with each flag key once.
- A provider with `decideOne` gets one call for each flag key.
- A flag that the store answers does not go to the provider.
- A flag that reaches the provider after the request has gone, such as after a slow store read, joins a new request.
- Two flags with the same key share one decision. Each flag checks that decision against its own definition.

The batch resolves the identity once. When the identity fails, every flag returns its default with an `IdentityNotFoundError`.

## Set the batch deadline

Each flag keeps its own timeout, which starts when the batch starts, so the shared identity resolution counts against it. The batch waits for the identity until the longest flag timeout passes, or with no limit when any flag has no timeout. A flag whose timeout passes first returns its default with an `EvaluationTimeoutError`. See [How to set timeouts and cancel evaluations](./set-timeouts-and-cancel.md).
