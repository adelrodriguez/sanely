# How to evaluate several gates in a batch

This guide shows you how to evaluate several gates for one operation, with one identity resolution and, when your provider supports it, one provider request.

1. If your provider has a batch API, add `decideMany` to the factory. It returns a record from flag key to decision:

   ```typescript
   const gate = buildGate({
     identify,
     decide,
     decideMany: (keys, identity, { signal } = {}) =>
       provider.evaluateAll(keys, identity, { signal }),
   })
   ```

2. Pass the gates to `gate.batch`. Destructure the result in the order of the gates:

   ```typescript
   const betaAccess = gate({ key: "beta-access", defaultValue: false })
   const theme = gate({ key: "theme", defaultValue: "light", variants: ["light", "dark"] })

   const result = await gate.batch([betaAccess, theme])
   const [hasBetaAccess, selectedTheme] = result
   ```

3. To read one gate by its evaluator, call `result.get(theme)` or `result.details(theme)`.

Each gate keeps its own hooks, validation, timeout, fallback value, and details.

## Know when a batch calls the provider

A batch does not always make one provider request:

- A cache hit does not go to the provider.
- If `decideMany` leaves out a key, the package calls `decide` for that key.
- Without `decideMany`, the package evaluates the cache misses in parallel with `decide`.

## Avoid the batch errors

- Give each gate in a batch a unique key. A repeated key rejects with `DuplicateBatchKeyError`.
- Use only gates from the same factory. TypeScript rejects a gate with another identity type or call mode. A gate from another factory with the same identity type and call mode rejects with `ForeignGateEvaluatorError` at run time.
- Read only the gates that you passed. `result.get` and `result.details` throw `BatchFlagNotFoundError` for another gate.
