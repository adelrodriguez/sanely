# How to evaluate several flags in a batch

This guide shows you how to evaluate several flags for one operation, with one identity resolution and, when your provider supports it, one provider request.

1. If your provider has a batch API, add `decideMany` to the factory. It returns a record from flag key to decision:

   ```typescript
   const flag = createFlags({
     identify,
     decide,
     decideMany: (keys, identity, { signal } = {}) =>
       provider.evaluateAll(keys, identity, { signal }),
   })
   ```

2. Pass the flags to `flag.batch`. Destructure the result in the order of the flags:

   ```typescript
   const betaAccess = flag({ key: "beta-access", defaultValue: false })
   const theme = flag({ key: "theme", defaultValue: "light", variants: ["light", "dark"] })

   const result = await flag.batch([betaAccess, theme])
   const [hasBetaAccess, selectedTheme] = result
   ```

3. To read one flag by its evaluator, call `result.get(theme)` or `result.details(theme)`.

Each flag keeps its own hooks, validation, timeout, fallback value, and details.

## Know when a batch calls the provider

A batch does not always make one provider request:

- A cache hit does not go to the provider.
- If `decideMany` leaves out a key, the package calls `decide` for that key.
- Without `decideMany`, the package evaluates the cache misses in parallel with `decide`.

## Avoid the batch errors

- Give each flag in a batch a unique key. A repeated key rejects with `DuplicateBatchKeyError`.
- Use only flags from the same factory. TypeScript rejects a flag with another identity type or call mode. A flag from another factory with the same identity type and call mode rejects with `ForeignFlagEvaluatorError` at run time.
- Read only the flags that you passed. `result.get` and `result.details` throw `BatchFlagNotFoundError` for another flag.
