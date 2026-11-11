# `@sanely/flags` reference

The package has three entry points:

| Entry point             | Exports                                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `@sanely/flags`         | `createFlags`, `flag`, `defineProvider`, `decision`, `anonymous`, the error classes, and the types.                  |
| `@sanely/flags/react`   | `FlagsProvider`, `useFlag`, `useFlags`, `FeatureFlag`, `useFlagCache`, `FlagsProviderMissingError`, and their types. |
| `@sanely/flags/testing` | `fakeProvider`, `memoryStore`, and the `FakeProvider` type.                                                          |

## `flag`

### `flag.boolean(key, defaultValue, options?)`

```ts
function boolean<const T extends string = never>(
  key: string,
  defaultValue: boolean,
  options?: { timeout?: number | ValidateTimeExpression<T> }
): BooleanFlag
```

Returns a frozen boolean flag definition.

### `flag.variant(key, variants, defaultValue, options?)`

```ts
function variant<
  const TVariants extends readonly [string, ...string[]],
  TPayload = unknown,
  const T extends string = never,
>(
  key: string,
  variants: TVariants,
  defaultValue: TVariants[number],
  options?: {
    payload?: (payload: unknown) => TPayload
    timeout?: number | ValidateTimeExpression<T>
  }
): VariantFlag<TVariants[number], TPayload>
```

Returns a frozen variant flag definition. The value type is the union of `variants`, and the payload type is the return type of `payload`. No call needs a type argument.

| Argument or option | Description                                                                                                                                                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `key`              | The provider key of the flag. A non-empty string.                                                                                                                                                                                             |
| `variants`         | The allowed variants. A non-empty array of unique strings.                                                                                                                                                                                    |
| `defaultValue`     | The value on any failure. A boolean for a boolean flag, or one of `variants`.                                                                                                                                                                 |
| `payload`          | Parses the variant payload of a decision. A throw makes the evaluation return the default.                                                                                                                                                    |
| `timeout`          | The deadline of this flag. It replaces the reader's `timeout`. A number of milliseconds or a time expression, such as `"500ms"`, greater than 0 and no greater than 2^31 - 1 milliseconds. The definition's `timeout` holds the milliseconds. |

An invalid argument throws `FlagDefinitionError` when you define the flag.

`ValidateTimeExpression` comes from [`@sanely/duration`](../../duration/README.md). It makes a literal that is not a time expression, such as `"1M"`, fail to compile with the reason. A string from config needs `isTimeExpression` from `@sanely/duration` first.

Two flags with the same key ask the provider about the same provider flag.

## `defineProvider(definition)`

```ts
function defineProvider<TIdentity extends Subject = Identity>(
  definition: ProviderDefinition<TIdentity>
): Provider<TIdentity>
```

Validates and freezes a provider. `TIdentity` comes from the annotation on the `identity` parameter of `decide` or `decideOne`. Without an annotation, it is `Identity`.

| Field       | Type                                                                                                              | Description                                                                    |
| ----------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `name`      | `string`                                                                                                          | Names the provider in `ProviderFailedError`. A non-empty string.               |
| `decideOne` | `(flag: Flag, identity: TIdentity, options: DecideOptions) => MaybePromise<Decision>`                             | Decides one flag. A batch calls it once for each flag key.                     |
| `decide`    | `(flags: readonly Flag[], identity: TIdentity, options: DecideOptions) => MaybePromise<Record<string, Decision>>` | Decides several flags in one call. Returns a record from flag key to decision. |
| `subscribe` | `(notify: (keys?: readonly string[]) => void) => () => void`                                                      | Attaches to the provider's flag changes and returns a function that detaches.  |

A provider has exactly one of `decide` and `decideOne`. TypeScript rejects both or neither, and so does the runtime check, which throws `FlagDefinitionError`.

`DecideOptions` is `{ signal: AbortSignal }`. The signal aborts when every evaluation that waits for the call has timed out or been cancelled.

A key that `decide` leaves out makes that flag return its default with an `InvalidDecisionError`. A throw or rejection from `decide` or `decideOne` makes the flags of that call return their defaults with a `ProviderFailedError`.

`notify(keys)` reports the changed flag keys. `notify()` reports that any flag may have changed.

## `decision`

| Function                              | Returns                                  |
| ------------------------------------- | ---------------------------------------- |
| `decision.boolean(value)`             | `{ type: "boolean", value }`             |
| `decision.variant(variant, payload?)` | `{ type: "variant", variant, payload? }` |

A boolean flag needs a boolean decision. A variant flag needs a variant decision with one of its variants. `payload` is the raw payload, before the flag's parser runs.

## `createFlags(options)`

```ts
function createFlags<TIdentity extends Subject>(
  options: FlagsOptions<TIdentity> & { identify: () => MaybePromise<TIdentity | null | undefined> }
): Flags<TIdentity>
function createFlags<TIdentity extends Subject>(
  options: FlagsOptions<TIdentity> & { identify?: undefined }
): CallerFlags<TIdentity>
```

Returns a reader. `TIdentity` comes from `provider`.

| Option     | Type                                                     | Default   | Description                                                                       |
| ---------- | -------------------------------------------------------- | --------- | --------------------------------------------------------------------------------- |
| `provider` | `Provider<TIdentity>`                                    | Required  | The provider that decides each flag.                                              |
| `identify` | `() => MaybePromise<TIdentity \| null \| undefined>`     | None      | Resolves the identity of each read. Without it, every read goes through `for`.    |
| `timeout`  | `number \| ValidateTimeExpression<T>`                    | None      | The deadline of each evaluation, such as `"1s"`. A flag's `timeout` replaces it.  |
| `cache`    | `CacheOptions<TIdentity>`                                | See below | The decision store, request coalescing, and the evaluation key.                   |
| `hooks`    | `ReadonlyArray<Hook<TIdentity>>`                         | `[]`      | Lifecycle observers.                                                              |
| `onError`  | `(report: ErrorReport<TIdentity>) => MaybePromise<void>` | None      | Receives the failures of hooks, store operations, and the provider's `subscribe`. |

An invalid `provider`, `timeout`, or `identify` throws `FlagDefinitionError`.

`identify` that returns `null` or `undefined`, or that throws, makes the evaluation return its default with an `IdentityNotFoundError`. The package reads `hooks` once, so a later change to the array has no effect.

### `CacheOptions`

| Option     | Type                                                | Default   | Description                                                                  |
| ---------- | --------------------------------------------------- | --------- | ---------------------------------------------------------------------------- |
| `store`    | `DecisionStore`                                     | None      | Stores decisions between evaluations.                                        |
| `coalesce` | `boolean`                                           | `true`    | Lets concurrent evaluations with one evaluation key share one provider call. |
| `key`      | `(context: EvaluationContext<TIdentity>) => string` | See below | Replaces the evaluation key, which the store and coalescing use.             |

The default evaluation key holds the flag key, the flag kind, the variants, and the type and value of `identity.distinctId`. The package never caches or coalesces an evaluation for `anonymous`.

### `DecisionStore`

```ts
type DecisionStore = {
  get(key: string): Promise<Decision | null | undefined>
  set(key: string, decision: Decision): Promise<void>
  delete?(key: string): Promise<unknown>
}
```

The package reads the store before the provider work, and writes the provider decision after it validates. The store owns serialization and expiry. A store failure never fails the evaluation, and an invalid stored decision goes to the provider. With `delete` and a provider `subscribe`, a change notification deletes the stored decisions of the changed flags.

## Readers

### `Flags<TIdentity>`

The value that `createFlags` returns with `identify`. It has every `FlagReader` method, `for`, and `subscribe`.

### `CallerFlags<TIdentity>`

The value that `createFlags` returns without `identify`. It has only `for` and `subscribe`.

| Member                | Description                                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `for(identity)`       | Returns a `FlagReader` for `identity`. A missing identity makes its reads return defaults with an `IdentityNotFoundError`. |
| `subscribe(listener)` | Calls `listener(keys?)` after each provider change. Returns a function that removes the listener.                          |

`subscribe` returns a function that does nothing when the provider has no `subscribe`. When the provider's `subscribe` throws, `onError` receives a `SubscribeFailed` report. The listener stays registered, and it receives changes once a later subscription or evaluation attaches the provider.

### `FlagReader`

| Method                         | Returns                             | Description                                                        |
| ------------------------------ | ----------------------------------- | ------------------------------------------------------------------ |
| `get(flag, options?)`          | `Promise<FlagValue<TFlag>>`         | The value of one flag.                                             |
| `details(flag, options?)`      | `Promise<EvaluationDetails<TFlag>>` | The details of one flag.                                           |
| `getMany(flags, options?)`     | `Promise<FlagValues<TFlags>>`       | The values of several flags, as a tuple in the order of `flags`.   |
| `detailsMany(flags, options?)` | A tuple of `EvaluationDetails`      | The details of several flags, in the order of `flags`.             |
| `snapshot(flags, options?)`    | `Promise<FlagSnapshot>`             | Serializable values of several flags, for a client's first render. |

`options` is `{ signal?: AbortSignal }`. A signal that aborts makes the evaluation return its default with an `EvaluationAbortedError`. No read rejects.

`getMany`, `detailsMany`, and `snapshot` resolve the identity once. Within one tick, the flags that need provider work share one provider request. A provider with `decide` gets one call with each flag key once. A provider with `decideOne` gets one call for each flag key. Each flag keeps its own hooks, validation, timeout, and fallback. The batch deadline is the longest flag timeout, or none when any flag has none.

The timeout of an evaluation covers identity resolution, the `before` hooks, store reads, provider work, and decision validation.

### `EvaluationDetails<TFlag>`

| Field     | Type                                 | Description                                                                          |
| --------- | ------------------------------------ | ------------------------------------------------------------------------------------ |
| `flagKey` | `string`                             | The flag key.                                                                        |
| `value`   | `FlagValue<TFlag>`                   | The returned value.                                                                  |
| `source`  | `"cache" \| "provider" \| "default"` | Where the value came from.                                                           |
| `payload` | `FlagPayload<TFlag> \| undefined`    | Only on a variant flag. The parsed payload, present when the decision has a payload. |
| `error`   | `EvaluationError`                    | Only when `source` is `"default"`. Why the evaluation fell back.                     |

### `FlagSnapshot`

```ts
type FlagSnapshot = {
  distinctId: string | number | null
  flags: Record<string, FlagSnapshotEntry>
}

type FlagSnapshotEntry = {
  kind: "boolean" | "variant"
  value: boolean | string
  source: "cache" | "provider" | "default"
  error?: EvaluationError["_tag"]
}
```

`distinctId` is the `distinctId` of the identity that the snapshot was made for. It is `null` for `anonymous` and for an identity that failed to resolve. `flags` holds one entry for each flag key. A snapshot holds no payloads.

## Identity

| Export      | Description                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------- |
| `Identity`  | `{ distinctId: string \| number } & Record<string, IdentityValue>`.                               |
| `anonymous` | A unique symbol. Return it from `identify`, or pass it to `for`, to evaluate without an identity. |
| `Anonymous` | `typeof anonymous`.                                                                               |
| `Subject`   | `Identity \| Anonymous`.                                                                          |

A provider accepts `anonymous` only when its `identity` parameter includes `Anonymous`.

## Hooks

### `Hook<TIdentity>`

| Phase                                  | Runs                                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `before(context)`                      | After identity resolution, and before the store and the provider work. The evaluation waits for it. |
| `after(context, decision, { source })` | After a valid decision. `source` is `"cache"` or `"provider"`. The evaluation does not wait for it. |
| `error(context, error)`                | When the evaluation falls back to the default. `error` is an `EvaluationError`.                     |
| `finally(context)`                     | After the success path or the error path. The evaluation does not wait for it.                      |

### `EvaluationContext<TIdentity>`

| Field      | Type                | Description                                                           |
| ---------- | ------------------- | --------------------------------------------------------------------- |
| `flag`     | `Flag`              | The flag definition.                                                  |
| `identity` | `TIdentity \| null` | The identity. `null` until it resolves, and when it fails to resolve. |
| `signal`   | `AbortSignal`       | The signal of the evaluation.                                         |

Hooks and the cache `key` function receive this context.

## Errors

Evaluations return these errors in `details().error` and never throw them. Each class has a literal `_tag` equal to its name.

| Error                    | Fields               | When                                                                                                                                                                                                                 |
| ------------------------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IdentityNotFoundError`  | `cause`              | `identify` returned nothing or threw, `for` received no identity, or the identity has no non-empty string or finite number `distinctId`. `cause` holds what `identify` threw, or a `TypeError` for the `distinctId`. |
| `InvalidDecisionError`   | `decision`, `reason` | The decision is malformed, has the other kind, names a variant that the flag does not allow, has a payload that the parser rejects, or is missing from a `decide` result.                                            |
| `ProviderFailedError`    | `provider`, `cause`  | `decide` or `decideOne` threw or rejected. `provider` is the provider's `name`.                                                                                                                                      |
| `EvaluationTimeoutError` | `timeout`            | The deadline passed. `timeout` holds the deadline in milliseconds.                                                                                                                                                   |
| `EvaluationAbortedError` | `cause`              | The caller's signal aborted. `cause` holds the signal's reason.                                                                                                                                                      |

`EvaluationError` is the union of these classes.

`FlagDefinitionError`, with a `reason` field, is thrown by `flag.boolean`, `flag.variant`, `defineProvider`, and `createFlags` for an invalid definition. `@sanely/flags/react` exports `FlagsProviderMissingError`, which the hooks throw outside a `FlagsProvider`.

## Error reports

`onError` receives an `ErrorReport`, a union of three reports with a literal `_tag`:

| Report            | Fields                                             | When                                                                                                                   |
| ----------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `HookFailed`      | `phase`, `hookIndex`, `error`, `context`           | A hook threw or rejected. The other hooks still run, and the result does not change.                                   |
| `StoreFailed`     | `operation`, `key`, `flagKey`, `identity`, `error` | A store operation or the `key` function failed. `operation` is `"get"`, `"set"`, `"delete"`, `"validate"`, or `"key"`. |
| `SubscribeFailed` | `error`                                            | The provider's `subscribe` threw. Evaluations continue without live invalidation.                                      |

## Types

| Type                                                                                    | Describes                                                               |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `Flag`, `BooleanFlag`, `VariantFlag<TVariant, TPayload>`                                | Flag definitions.                                                       |
| `FlagValue<TFlag>`, `FlagPayload<TFlag>`, `FlagValues<TFlags>`                          | The value, payload, and value tuple of flags.                           |
| `Provider<TIdentity>`, `ProviderDefinition<TIdentity>`, `DecideOptions`                 | A provider, what `defineProvider` takes, and the provider call options. |
| `Decision`, `DecisionSource`                                                            | A decision, and `"cache" \| "provider"`.                                |
| `Flags`, `CallerFlags`, `FlagReader`, `FlagsOptions`, `ReadOptions`                     | Readers and their options.                                              |
| `EvaluationDetails`, `EvaluationError`                                                  | Evaluation results.                                                     |
| `FlagSnapshot`, `FlagSnapshotEntry`                                                     | Snapshots.                                                              |
| `Identity`, `IdentityValue`, `Anonymous`, `Subject`, `EvaluationContext`                | Identities and the evaluation context.                                  |
| `Hook`, `HookFailedReport`, `StoreFailedReport`, `SubscribeFailedReport`, `ErrorReport` | Hooks and error reports.                                                |
| `CacheOptions`, `DecisionStore`                                                         | The `cache` option and its store.                                       |
| `ChangeListener`                                                                        | `(keys?: readonly string[]) => void`.                                   |
| `MaybePromise<T>`                                                                       | `T \| Promise<T>`.                                                      |

## `@sanely/flags/react`

Every export is client-only. The module has a `"use client"` directive. A component that reads a flag without a snapshot needs a Suspense boundary.

### `FlagsProvider`

| Prop       | Type                       | Description                                                                                                             |
| ---------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `flags`    | `Flags` or `CallerFlags`   | The reader from `createFlags`.                                                                                          |
| `identity` | The reader's identity type | Evaluates for this identity. Optional for `Flags`, which can use `identify`. Required for `CallerFlags`.                |
| `snapshot` | `FlagSnapshot`             | Values for the first render. Ignored when its `distinctId` differs from `identity`. Read only when the provider mounts. |
| `cache`    | `FlagCacheOptions`         | The limits of the flag cache.                                                                                           |
| `children` | `ReactNode`                | The subtree.                                                                                                            |

Each mount creates its own flag cache, so a server never shares one between requests. A provider without `identity` accepts any snapshot, because its reader resolves the identity itself.

An identity in a cache key can hold strings, numbers, booleans, `null`, `undefined`, arrays, and plain records with string keys. Other values throw a `TypeError`.

### `FlagCacheOptions`

| Option       | Type                                  | Default  | Description                                                                                                                  |
| ------------ | ------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `maxEntries` | `number`                              | `100`    | The most settled entries for each list of flags. A positive integer.                                                         |
| `ttl`        | `number \| ValidateTimeExpression<T>` | `300000` | How long an evaluation stays cached, in milliseconds or as a time expression such as `"5m"`.                                 |
| `pendingTtl` | `number \| ValidateTimeExpression<T>` | None     | How long a pending evaluation stays before the cache can remove it, such as `"30s"`. Removal does not cancel the evaluation. |

### `useFlag(flag)`

Returns the value of one flag. It returns the snapshot value when the snapshot has a valid entry for the flag, and otherwise suspends until the flag settles. It throws `FlagsProviderMissingError` outside a `FlagsProvider`.

### `useFlags(flags)`

Returns the values of several flags as a tuple, in order, with one suspension. It reads the snapshot only when the snapshot has every flag.

A provider change for one of the flags drops its cached value and its snapshot entry, and re-renders the components that read it.

### `FeatureFlag`

| Prop       | Type        | Description                                                                                                   |
| ---------- | ----------- | ------------------------------------------------------------------------------------------------------------- |
| `flag`     | `Flag`      | The flag.                                                                                                     |
| `match`    | A variant   | Required for a variant flag, and typed to its variants. Not allowed for a boolean flag, which matches `true`. |
| `children` | `ReactNode` | Renders when the value matches.                                                                               |
| `fallback` | `ReactNode` | Renders when the value does not match, and when the evaluation falls back to the default.                     |
| `loading`  | `ReactNode` | When present, `FeatureFlag` adds a Suspense boundary with this fallback.                                      |

### `useFlagCache()`

Returns `FlagCacheControls` for the nearest `FlagsProvider` and its identity:

| Method              | Description                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `prefetch(flags)`   | Evaluates the flags into the cache, so a later `useFlag` or `useFlags` with the same flags in the same order does not suspend. |
| `invalidate(flags)` | Drops the cached values of these flags, including their snapshot entries, and re-renders their readers.                        |
| `clear()`           | Drops every cached value and the snapshot.                                                                                     |

### React types

| Type                         | Describes                              |
| ---------------------------- | -------------------------------------- |
| `FlagsProviderProps<TFlags>` | The props of `FlagsProvider`.          |
| `FeatureFlagProps<TFlag>`    | The props of `FeatureFlag`.            |
| `FlagCacheControls`          | The value that `useFlagCache` returns. |
| `FlagCacheOptions`           | The `cache` prop of `FlagsProvider`.   |

## `@sanely/flags/testing`

### `fakeProvider(entries?)`

```ts
function fakeProvider(entries?: [flag, value, payload?][]): FakeProvider
```

Returns a provider named `"fake"` that answers with the values you give. TypeScript checks each value against its flag. A flag without a value returns its default with an `InvalidDecisionError`. The provider accepts any identity and `anonymous`.

`FakeProvider` adds `set(flag, value, payload?)`, which changes a flag's value and notifies the reader's change listeners.

### `memoryStore()`

Returns a `DecisionStore` that keeps decisions in a `Map`.
