# `@sanely/flags` reference

The package has three entry points:

| Entry point           | Exports                                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `@sanely/flags`       | `createFlags`, `decision`, `defineHook`, the error classes, and the types.                                                       |
| `@sanely/flags/hooks` | `defineHook`.                                                                                                                    |
| `@sanely/flags/react` | `useFlag`, `useFlagBatch`, `FeatureFlag`, `FlagProvider`, `useFlagCache`, `createFlagCache`, `createFlagHooks`, and their types. |

## `createFlags(config)`

```ts
function createFlags<TIdentity extends Identity>(
  config: FlagFactoryConfig<TIdentity>
): FlagFactory<TIdentity>
function createFlags<TIdentity extends Identity>(
  config: AnonymousFlagFactoryConfig<TIdentity>
): FlagFactory<TIdentity, TIdentity | null>
function createFlags<TIdentity extends Identity>(
  config: CallerIdentityFlagFactoryConfig<TIdentity>
): FlagFactory<TIdentity, TIdentity, true>
```

Returns a flag factory. The configuration selects one of three call modes:

| Mode            | Configuration                       | Identity                                                      |
| --------------- | ----------------------------------- | ------------------------------------------------------------- |
| `identify`      | `identify`, no `anonymous`          | `identify` resolves it. A call can override it. `null` fails. |
| Anonymous       | `identify` and `anonymous: "allow"` | `identify` resolves it, and it can be `null`.                 |
| Caller identity | No `identify`                       | Each call must pass it.                                       |

| Option          | Type                                                                      | Default    | Description                                                                  |
| --------------- | ------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------- |
| `identify`      | `() => MaybePromise<TIdentity \| null>`                                   | None       | Resolves the identity.                                                       |
| `anonymous`     | `"reject" \| "allow"`                                                     | `"reject"` | `"allow"` lets the identity be `null`.                                       |
| `decide`        | `(key, identity, { signal }?) => MaybePromise<Decision>`                  | Required   | Returns the provider decision for one flag.                                  |
| `decideMany`    | `(keys, identity, { signal }?) => MaybePromise<Record<string, Decision>>` | None       | Returns the decisions for several flags in a batch.                          |
| `cache`         | `DecisionCache`                                                           | None       | Stores decisions.                                                            |
| `coalesce`      | `boolean`                                                                 | `true`     | Lets concurrent evaluations with one evaluation key share one provider call. |
| `evaluationKey` | `(context: HookContext) => string`                                        | See below  | Returns the key for the cache and for coalescing.                            |
| `hooks`         | `Hook[]`                                                                  | `[]`       | Lifecycle observers.                                                         |
| `onHookError`   | `(report: HookErrorReport) => MaybePromise<void>`                         | None       | Receives the error of a hook that threw.                                     |
| `onCacheError`  | `(report: DecisionCacheErrorReport) => MaybePromise<void>`                | None       | Receives a cache, key, validation, or `subscribe` error.                     |
| `subscribe`     | `(notify: (change: FlagChange) => void) => () => void`                    | None       | Attaches to provider changes, and returns a function that detaches.          |
| `timeoutMs`     | `number`                                                                  | None       | The timeout of every flag of the factory.                                    |

The default evaluation key holds the flag key, the flag shape, and the type and value of `identity.distinctId`. The package does not cache or coalesce an evaluation with a `null` identity.

## Flag factory

```ts
const beta = flag({ key, defaultValue, timeoutMs? })
const theme = flag<TPayload>({ key, defaultValue, variants, timeoutMs? })
```

Creates a flag. TypeScript infers the value type from `variants`. When you give `TPayload` as a type argument, the value type is `string`.

| Option         | Type                                 | Description                                                                          |
| -------------- | ------------------------------------ | ------------------------------------------------------------------------------------ |
| `key`          | `string`                             | The flag key that `decide` receives.                                                 |
| `defaultValue` | `boolean`, or a member of `variants` | The value on any failure. A default that is not in `variants` throws a `RangeError`. |
| `variants`     | `string[]`                           | The allowed variants. With `variants`, the flag is a variant flag.                   |
| `timeoutMs`    | `number`                             | The timeout of this flag. It overrides the factory `timeoutMs`.                      |

The factory also has these members:

| Member                        | Description                                                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `batch(flags, options?)`      | Evaluates several flags of this factory. Resolves with a `FlagBatch`.                                                                  |
| `changes.subscribe(listener)` | Calls `listener(keys?)` on each provider change. Returns a function that removes it. `keys` is `undefined` for a change to every flag. |

### `batch(flags, options?)`

Resolves the identity once, reads the cache, calls `decideMany` for the misses when it exists, and calls `decide` for each key that `decideMany` leaves out. Without `decideMany`, it calls `decide` for each miss in parallel. Each flag keeps its own hooks, validation, timeout, and fallback.

It rejects with `DuplicateBatchKeyError` for a repeated key, and with `ForeignFlagEvaluatorError` for a flag from another factory.

`FlagBatch` is a read-only tuple of the values, in the order of `flags`, with two methods:

| Method          | Description                                                                      |
| --------------- | -------------------------------------------------------------------------------- |
| `get(flag)`     | Returns the value of `flag`. Throws `BatchFlagNotFoundError` for another flag.   |
| `details(flag)` | Returns the details of `flag`. Throws `BatchFlagNotFoundError` for another flag. |

```ts
const result = await flag.batch([betaAccess, theme])
const [hasBetaAccess, selectedTheme] = result
```

## Evaluator

```ts
flag(options?): Promise<TValue>
flag.details(options?): Promise<EvaluationDetails<TValue, TPayload>>
```

Evaluates the flag. Neither call rejects: a failure returns the default value.

`FlagCallOptions`:

| Option     | Type                                     | Description                                                                  |
| ---------- | ---------------------------------------- | ---------------------------------------------------------------------------- |
| `identity` | `TIdentity`, or `null` in anonymous mode | Overrides the resolved identity. Required in caller identity mode.           |
| `signal`   | `AbortSignal`                            | Cancels the evaluation. Before a commit, a cancellation returns the default. |

The timeout covers identity resolution, the `before` hooks, cache reads, provider work, and decision validation.

### `EvaluationDetails`

| Field     | Type                                 | Description                                                           |
| --------- | ------------------------------------ | --------------------------------------------------------------------- |
| `value`   | `TValue`                             | The returned value.                                                   |
| `flagKey` | `string`                             | The flag key.                                                         |
| `source`  | `"cache" \| "provider" \| "default"` | Where the value came from.                                            |
| `payload` | `TPayload \| undefined`              | Only on a variant flag. The payload of a successful variant decision. |
| `error`   | `Error`                              | Only when `source` is `"default"`. The failure.                       |

```ts
const details = await betaAccess.details()
// { flagKey: "beta-access", value: true, source: "provider" }
```

## `decision`

| Function                              | Returns                                  |
| ------------------------------------- | ---------------------------------------- |
| `decision.boolean(value)`             | `{ type: "boolean", value }`             |
| `decision.variant(variant, payload?)` | `{ type: "variant", variant, payload? }` |

`Decision<TPayload>` is the union of the two shapes. A boolean flag needs a boolean decision, and a variant flag needs a variant decision with an allowed variant.

## Hooks

### `defineHook(hook)` and `defineHook(factory)`

```ts
function defineHook<TIdentity>(hook: Hook<TIdentity>): Hook<TIdentity>
function defineHook<TOptions, TIdentity>(
  factory: (options: TOptions) => Hook<TIdentity>
): (options: TOptions) => Hook<TIdentity>
```

Returns its argument with its type. The first form shares one hook object, and its state, between every registration. The second form returns a function that makes a new hook on each call.

### `Hook`

| Phase                                  | Runs                                                                                                        |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `before(context)`                      | Before the cache and the provider work. The evaluation waits for it.                                        |
| `after(context, decision, { source })` | After a valid decision commits. `source` is `"cache"` or `"provider"`. The evaluation does not wait for it. |
| `error(context, error)`                | When the evaluation fails and returns the default.                                                          |
| `finally(context)`                     | After the success path or the error path. The evaluation does not wait for it.                              |

Each hook receives one read-only `HookContext` for the whole evaluation:

| Field          | Type                             | Description                     |
| -------------- | -------------------------------- | ------------------------------- |
| `flagKey`      | `string`                         | The flag key.                   |
| `identity`     | `TIdentity \| null`              | The identity.                   |
| `signal`       | `AbortSignal`                    | The signal of the evaluation.   |
| `kind`         | `"boolean" \| "variant"`         | The flag shape.                 |
| `defaultValue` | `boolean \| string`              | The default value.              |
| `variants`     | `readonly string[] \| undefined` | The variants of a variant flag. |

A hook that throws does not change the result. `onHookError` receives a `HookErrorReport`: `{ phase, hookIndex, error, context }`.

## Cache

### `DecisionCache`

```ts
type DecisionCache = {
  get(key: string): Promise<Decision | null | undefined>
  set(key: string, value: Decision): Promise<void>
  delete?(key: string): Promise<boolean | undefined>
}
```

The package reads the cache before the provider work, and writes the provider decision after the commit. The store owns serialization and expiry. A cache error never fails the evaluation, and an invalid cached decision goes to the provider.

`onCacheError` receives a `DecisionCacheErrorReport`: `{ operation, key, flagKey, identity, error }`. `operation` is `"key"`, `"get"`, `"set"`, `"delete"`, `"validate"`, or `"subscribe"`.

### `subscribe`

`notify({ keys })` invalidates the cached decisions and the running provider calls of the named flags. `notify({})` invalidates every flag. A factory attaches `subscribe` at most once at a time, and shares the attachment between invalidation and `changes` listeners. After its first evaluation that uses the cache or coalescing, the factory stays attached. It also stays attached after a React flag cache first stores one of its evaluations. A factory that only `changes` listeners use detaches when the last listener leaves.

## Errors

Every error class extends `FlagError`. A failed evaluation returns the error in `details().error`, except where the table says that a call throws.

| Error                       | Fields                             | When                                                                    |
| --------------------------- | ---------------------------------- | ----------------------------------------------------------------------- |
| `IdentityNotFoundError`     |                                    | The identity is `null`, and anonymous evaluation is off.                |
| `DecisionTypeMismatchError` | `decision`, `expected`, `received` | The decision type does not match the flag shape.                        |
| `InvalidVariantError`       |                                    | The variant is not in `variants`.                                       |
| `MalformedDecisionError`    |                                    | The decision is not a valid decision object.                            |
| `FlagTimeoutError`          |                                    | The timeout expired.                                                    |
| `DuplicateBatchKeyError`    |                                    | A batch has a repeated key. `batch` rejects.                            |
| `ForeignFlagEvaluatorError` |                                    | A batch has a flag from another factory. `batch` rejects.               |
| `BatchFlagNotFoundError`    |                                    | `get` or `details` of a batch received another flag. The method throws. |

A cancellation returns the reason of the signal as the error, such as an `AbortError`. A failure of `decide` returns the error that `decide` threw.

## Types

The types come from `@sanely/flags`:

| Type                                                                                 | Describes                                                           |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `Identity`                                                                           | `{ distinctId: string \| number } & Record<string, IdentityValue>`. |
| `IdentityValue`                                                                      | A value of an identity attribute.                                   |
| `FlagFactoryConfig`, `AnonymousFlagFactoryConfig`, `CallerIdentityFlagFactoryConfig` | The configurations of the three call modes.                         |
| `FlagFactory`                                                                        | The value that `createFlags` returns.                               |
| `FlagEvaluator`                                                                      | An evaluator.                                                       |
| `FlagBatch`                                                                          | The value that `batch` resolves with.                               |
| `FlagCallOptions`                                                                    | The options of an evaluator call.                                   |
| `Decision`, `DecisionSource`                                                         | A decision, and `"cache" \| "provider"`.                            |
| `EvaluationDetails`                                                                  | The value that `details()` resolves with.                           |
| `DecisionCache`, `DecisionCacheErrorReport`                                          | The cache store and its error report.                               |
| `FlagChange`, `FlagChanges`                                                          | The argument of `notify`, and the type of `changes`.                |
| `Hook`, `HookContext`, `HookErrorReport`                                             | A hook, its context, and its error report.                          |
| `MaybePromise<T>`                                                                    | `T \| Promise<T>`.                                                  |

## `@sanely/flags/react`

Every export is client-only. The module has a `"use client"` directive. A component that calls a flag hook needs a Suspense boundary.

### `useFlag(flag, options?)`

```ts
function useFlag(flag, options?: { identity?; ttlMs?; details?: false }): TValue
function useFlag(flag, options: { identity?; ttlMs?; details: true }): EvaluationDetails
function useFlag<TValue>(
  fn: () => Promise<TValue>,
  options: { key: ReactFlagCacheKey; ttlMs? }
): TValue
```

Suspends until the flag settles, and returns its value, or its details with `details: true`. Without `identity`, it uses the identity of the nearest `FlagProvider`, and then the factory `identify`. The third form caches any async function under `key`. It throws a `TypeError` without `key`.

### `useFlagBatch(flags, options?)`

```ts
function useFlagBatch(flags, options?: { identity?; ttlMs? }): FlagBatchValues
```

Evaluates several flags with one suspension, and returns their values in order.

### `FeatureFlag`

| Prop       | Type                   | Description                                                                                        |
| ---------- | ---------------------- | -------------------------------------------------------------------------------------------------- |
| `flag`     | Evaluator              | The flag.                                                                                          |
| `match`    | `boolean` or a variant | The value that renders `children`. Default `true` for a boolean flag. Required for a variant flag. |
| `children` | `ReactNode`            | Renders when the value matches.                                                                    |
| `fallback` | `ReactNode`            | Renders when the value does not match.                                                             |
| `loading`  | `ReactNode`            | When present, `FeatureFlag` adds a Suspense boundary with this fallback.                           |
| `identity` | `Identity`             | Overrides the identity.                                                                            |

### `FlagProvider`

| Prop       | Type             | Description                                                            |
| ---------- | ---------------- | ---------------------------------------------------------------------- |
| `cache`    | `ReactFlagCache` | The cache for the subtree. Without it, each mount creates a new cache. |
| `identity` | `Identity`       | The default identity for flag consumers below it.                      |
| `children` | `ReactNode`      | The subtree.                                                           |

TypeScript does not check `identity` against the identity type of the flags. Use `createFlagHooks` for that check.

### `useFlagCache()`

Returns the active `ReactFlagCache`. Its `invalidate`, `invalidateBatch`, `prefetch`, and `prefetchBatch` methods use the provider identity when you leave the identity out.

### `createFlagCache(options?)`

| Option         | Type     | Default  | Description                                                                                                 |
| -------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| `maxEntries`   | `number` | `100`    | The most settled entries in each bucket. A positive integer.                                                |
| `ttlMs`        | `number` | `300000` | How long an evaluation stays cached, in milliseconds.                                                       |
| `pendingTtlMs` | `number` | None     | How long a pending evaluation stays before the cache can remove it. Removal does not cancel the evaluation. |

Each evaluator and each batch tuple has its own bucket. The custom async functions of `useFlag` share one bucket. A provider change from `subscribe` invalidates the matching entries. An entry that no mounted component reads evaluates again on its next read.

`ReactFlagCache` has these methods:

| Method                                        | Description                                  |
| --------------------------------------------- | -------------------------------------------- |
| `prefetch(flag, { identity?, ttlMs? })`       | Starts an evaluation and caches it.          |
| `prefetchBatch(flags, { identity?, ttlMs? })` | Starts a batch and caches it.                |
| `invalidate(flag, identity?)`                 | Removes the entry of one flag and identity.  |
| `invalidateBatch(flags, identity?)`           | Removes the entry of one batch and identity. |
| `invalidateKey(key)`                          | Removes the entry of a custom function key.  |
| `clear()`                                     | Removes every entry.                         |

An identity in a cache key can hold strings, numbers, booleans, `null`, `undefined`, arrays, and plain records with string keys. Other values throw a `TypeError`.

### `createFlagHooks(factory)`

Returns `{ FlagProvider, useFlag, useFlagBatch }`, typed to the identity type and call mode of `factory`. The provider requires a complete identity, and the hooks accept only flags of that identity type and call mode. The hooks read the identity only from their own provider. Without it, the factory resolves the identity.

### React types

| Type                          | Describes                                        |
| ----------------------------- | ------------------------------------------------ |
| `ReactFlagCache`              | The value that `createFlagCache` returns.        |
| `ReactFlagCacheOptions`       | The options of `createFlagCache`.                |
| `ReactFlagCacheKey`           | The `key` of a custom function in `useFlag`.     |
| `FlagHooks`                   | The value that `createFlagHooks` returns.        |
| `FlagValueOf<TFlag>`          | The value type of a flag.                        |
| `FlagDetailsOf<TFlag>`        | The details type of a flag.                      |
| `FlagIdentityOf<TFlag>`       | The identity type of a flag.                     |
| `FlagBatchValuesOf<TFlags>`   | The value tuple of a batch.                      |
| `FlagBatchIdentityOf<TFlags>` | The identity that every flag of a batch accepts. |
