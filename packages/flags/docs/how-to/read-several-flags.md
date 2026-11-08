# How to read several flags at once

This guide shows you how to evaluate several flags for one operation, with one identity resolution and one provider request.

1. Pass the flags to `getMany`. Destructure the result in the order of the flags:

   ```typescript
   const [hasBetaAccess, selectedTheme] = await flags.getMany([betaAccess, theme])
   ```

   TypeScript types the tuple from the flags, here `[boolean, "light" | "dark" | "system"]`.

2. To read the details of each flag, use `detailsMany`:

   ```typescript
   const [betaDetails, themeDetails] = await flags.detailsMany([betaAccess, theme])
   ```

Each flag keeps its own hooks, validation, timeout, fallback value, and details. One flag's failure does not change the others.

## Know when a batch calls the provider

The flags that need provider work in the same tick share one provider request:

- A provider with `decide` gets one call, with each flag key once.
- A provider with `decideOne` gets one call for each flag key.
- A flag that the store answers does not go to the provider.
- Two flags with the same key share one decision. Each flag checks that decision against its own definition.

The batch resolves the identity once. When the identity fails, every flag returns its default with an `IdentityNotFoundError`.

## Set the batch deadline

Each flag keeps its own timeout. The batch as a whole uses the longest flag timeout, or none when any flag has no timeout. See [How to set timeouts and cancel evaluations](./set-timeouts-and-cancel.md).
