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
  defaultValue: NoInfer<TVariants[number]>,
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
| `payload`          | Parses the variant payload of a decision. A throw makes the evaluation return the default. Without it, `details` returns the raw payload.                                                                                                     |
| `timeout`          | The deadline of this flag. It replaces the reader's `timeout`. A number of milliseconds or a time expression, such as `"500ms"`, greater than 0 and no greater than 2^31 - 1 milliseconds. The definition's `timeout` holds the milliseconds. |

An invalid argument throws `FlagDefinitionError` when you define the flag.

`ValidateTimeExpression` comes from [`@sanely/duration`](../../duration/README.md). It makes a literal that is not a time expression, such as `"1M"`, fail to compile with the reason. A string from config needs `isTimeExpression` from `@sanely/duration` first.

Two flags with the same key ask the provider about the same provider flag.

### Flag definition fields

A flag definition is frozen. A provider reads these fields:

| Field          | Type                                            | Description                                                       |
| -------------- | ----------------------------------------------- | ----------------------------------------------------------------- |
| `kind`         | `"boolean"` or `"variant"`                      | The kind of flag.                                                 |
| `key`          | `string`                                        | The flag key.                                                     |
| `defaultValue` | `boolean`, or one of `variants`                 | The value on any failure.                                         |
| `timeout`      | `number \| undefined`                           | The deadline in milliseconds, or `undefined` to use the reader's. |
| `variants`     | `readonly TVariant[]`                           | Only on a variant flag. The allowed variants.                     |
| `payload`      | `((payload: unknown) => TPayload) \| undefined` | Only on a variant flag. The payload parser.                       |

## `defineProvider(definition)`

```ts
function defineProvider<TIdentity extends Subject = Identity>(
  definition: ProviderDefinition<TIdentity>
): Provider<TIdentity>
```

Validates and freezes a provider. `TIdentity` comes from the annotation on the `identity` parameter of `decide` or `decideOne`. Without an annotation, it is `Identity`.

| Field       | Type                                                                                                                        | Description                                                                    |
| ----------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `name`      | `string`                                                                                                                    | Names the provider in `ProviderFailedError`. A non-empty string.               |
| `decideOne` | `(flag: Flag, identity: TIdentity, options: DecideOptions) => MaybePromise<Decision>`                                       | Decides one flag. A batch calls it once for each flag key.                     |
| `decide`    | `(flags: readonly Flag[], identity: TIdentity, options: DecideOptions) => MaybePromise<Readonly<Record<string, Decision>>>` | Decides several flags in one call. Returns a record from flag key to decision. |
| `subscribe` | `(notify: (keys?: readonly string[]) => void) => () => void`                                                                | Attaches to the provider's flag changes and returns a function that detaches.  |

A provider has exactly one of `decide` and `decideOne`. TypeScript rejects both or neither, and so does the runtime check, which throws `FlagDefinitionError`.

`DecideOptions` is `{ signal: AbortSignal }`. The signal aborts when every evaluation that waits for the call has timed out or been cancelled. In a batch, it also aborts after the call settles.

A key that `decide` leaves out makes that flag return its default with an `InvalidDecisionError` whose `problem` is `"missing"`. A result that is not an object does the same for every flag of the call. A throw or rejection from `decide` or `decideOne` makes every flag of that call return its default with a `ProviderFailedError`.

`notify(keys)` reports the changed flag keys. `notify()` reports that any flag may have changed.

## `decision`

| Function                              | Returns                                  |
| ------------------------------------- | ---------------------------------------- |
| `decision.boolean(value)`             | `{ type: "boolean", value }`             |
| `decision.variant(variant, payload?)` | `{ type: "variant", variant, payload? }` |

A boolean flag needs a boolean decision. A variant flag needs a variant decision with one of its variants. `payload` is the raw payload, before the flag's parser runs.

## `createFlags(options)`

```ts
function createFlags<TIdentity extends Subject, const T extends string = never>(
  options: FlagsOptions<TIdentity, T> & {
    identify: () => MaybePromise<NoInfer<TIdentity> | null | undefined>
  }
): Flags<TIdentity>
function createFlags<TIdentity extends Subject, const T extends string = never>(
  options: FlagsOptions<TIdentity, T> & { identify?: undefined }
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

The package calls `onError` on a later microtask. A throw or rejection from `onError` is ignored.

### `CacheOptions`

| Option     | Type                                                                 | Default   | Description                                                                                                                                                                         |
| ---------- | -------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `store`    | `DecisionStore`                                                      | None      | Stores decisions between evaluations.                                                                                                                                               |
| `coalesce` | `boolean`                                                            | `true`    | Lets concurrent evaluations with one evaluation key share one provider call.                                                                                                        |
| `key`      | `(context: EvaluationContext<TIdentity>) => readonly FlagCacheKey[]` | See below | Returns the identity fields that also change the decision. The package adds them to the evaluation key, which the store and coalescing use, and to the key of the React flag cache. |

The default evaluation key holds the provider's `name`, the flag key, the flag kind, the variants, and the type and value of `identity.distinctId`. The package never caches or coalesces an evaluation for `anonymous`.

### `DecisionStore`

```ts
type DecisionStore = {
  get(key: string): Promise<Decision | null | undefined>
  set(key: string, decision: Decision, entry: { readonly flagKey: string }): Promise<void>
  delete?(key: string): Promise<unknown>
  deleteFlags?(flagKeys?: readonly string[]): Promise<unknown>
}
```

The package reads the store before the provider work, and writes the provider decision after it validates. The read does not wait for the write, and the timeout does not cover it. Writes and deletes for one key run one at a time, in order. The store owns serialization and expiry. A store failure never fails the evaluation, and an invalid stored decision goes to the provider, which `delete` removes when the store has it.

With a provider `subscribe` and a store with `deleteFlags`, a change notification after the reader's first shared evaluation calls `deleteFlags` with the changed flag keys, or with none for a notification that names no flags. The store deletes those flags' decisions, including those that other processes stored. `set` passes each decision's `flagKey` so that the store can find them. The package waits for the writes of those flags that already started, and reads of those flags skip the store until the delete completes. A store without `deleteFlags` keeps its decisions after a change until it expires them.

## Readers

### `Flags<TIdentity>`

The value that `createFlags` returns with `identify`. It has every `FlagReader` method, `for`, `subscribe`, and `dispose`.

### `CallerFlags<TIdentity>`

The value that `createFlags` returns without `identify`. It has only `for`, `subscribe`, and `dispose`.

| Member                | Description                                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `for(identity)`       | Returns a `FlagReader` for `identity`. A missing identity makes its reads return defaults with an `IdentityNotFoundError`. |
| `subscribe(listener)` | Calls `listener(keys?)` after each provider change. Returns a function that removes the listener.                          |
| `dispose()`           | Detaches the reader from its provider and drops its decision memory. Also available as `using flags = createFlags(...)`.   |

A reader stays attached to its provider until you dispose it, so create one reader for the process, or dispose a reader that you create for one request. After `dispose`, reads still work, but they skip the store and coalescing, and `subscribe` does nothing. A `FlagsProvider` on a disposed reader still renders, but a provider change no longer drops its cached values. Calling `dispose` again does nothing. If the provider's detach function throws, `dispose` still drops the reader's decision memory before it rethrows the error.

The reader calls each `subscribe` listener on a later microtask, and ignores a throw from it. `subscribe` returns a function that does nothing when the provider has no `subscribe`. When the provider's `subscribe` throws, `onError` receives a `SubscribeFailed` report. The listener stays registered, and it receives changes once a later subscription or evaluation attaches the provider.

### `FlagReader`

| Method                         | Returns                             | Description                                                        |
| ------------------------------ | ----------------------------------- | ------------------------------------------------------------------ |
| `get(flag, options?)`          | `Promise<FlagValue<TFlag>>`         | The value of one flag.                                             |
| `details(flag, options?)`      | `Promise<EvaluationDetails<TFlag>>` | The details of one flag.                                           |
| `getMany(flags, options?)`     | `Promise<FlagValues<TFlags>>`       | The values of several flags, as a tuple in the order of `flags`.   |
| `detailsMany(flags, options?)` | A tuple of `EvaluationDetails`      | The details of several flags, in the order of `flags`.             |
| `snapshot(flags, options?)`    | `Promise<FlagSnapshot>`             | Serializable values of several flags, for a client's first render. |

`options` is `{ signal?: AbortSignal; fresh?: boolean }`. A signal that aborts makes the evaluation return its default with an `EvaluationAbortedError`. `fresh: true` deletes the stored decision with the store's `delete`, skips any provider call in flight, asks the provider, and stores its decision. Other reads of the flag then miss the store until the new decision is stored, so none of them returns the replaced one. A store without `delete` keeps the replaced decision, and other reads can return it until the fresh decision is stored. No read rejects.

`getMany`, `detailsMany`, and `snapshot` resolve the identity once. Within one tick, the flags that need provider work share one provider request. A flag that reaches the provider later, such as after a slow store read, joins a new request. A provider with `decide` gets one call with each flag key once. A provider with `decideOne` gets one call for each flag key. Each flag keeps its own hooks, validation, timeout, and fallback. Each flag's timeout starts when the `getMany`, `detailsMany`, or `snapshot` call starts, before the identity lookup. The batch waits for the identity until the longest flag timeout passes, or with no limit when any flag has no timeout.

The timeout of an evaluation covers identity resolution, the `before` hooks, store reads, provider work, decision validation, and the `error` hooks.

### `EvaluationDetails<TFlag>`

| Field     | Type                                 | Description                                                                                        |
| --------- | ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `flagKey` | `string`                             | The flag key.                                                                                      |
| `value`   | `FlagValue<TFlag>`                   | The returned value.                                                                                |
| `source`  | `"cache" \| "provider" \| "default"` | Where the value came from.                                                                         |
| `payload` | `FlagPayload<TFlag>`                 | Optional, and only on a variant flag. The parsed payload, present when the decision has a payload. |
| `error`   | `EvaluationError`                    | Only when `source` is `"default"`. Why the evaluation fell back.                                   |

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

| Export      | Description                                                                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Identity`  | `{ distinctId: string \| number } & Record<string, IdentityValue>`. `IdentityValue` is `bigint \| boolean \| number \| object \| string \| symbol \| null \| undefined`. |
| `anonymous` | A unique symbol. Return it from `identify`, or pass it to `for`, to evaluate without an identity.                                                                        |
| `Anonymous` | `typeof anonymous`.                                                                                                                                                      |
| `Subject`   | `Identity \| Anonymous`.                                                                                                                                                 |

A provider accepts `anonymous` only when its `identity` parameter includes `Anonymous`.

## Hooks

### `Hook<TIdentity>`

| Phase                                  | Runs                                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `before(context)`                      | After identity resolution, and before the store and the provider work. The evaluation waits for it.                             |
| `after(context, decision, { source })` | After a valid decision. `source` is `"cache"` or `"provider"`. The evaluation does not wait for it.                             |
| `error(context, error)`                | When the evaluation falls back to the default. `error` is an `EvaluationError`. The evaluation waits for it until its deadline. |
| `finally(context)`                     | After the success path or the error path. The evaluation does not wait for it.                                                  |

The hooks of one phase run concurrently. On a timeout or a cancellation, the `error` and `finally` phases start together, so `finally` can run before `error` finishes.

### `EvaluationContext<TIdentity>`

| Field      | Type                | Description                                                           |
| ---------- | ------------------- | --------------------------------------------------------------------- |
| `flag`     | `Flag`              | The flag definition.                                                  |
| `identity` | `TIdentity \| null` | The identity. `null` until it resolves, and when it fails to resolve. |
| `signal`   | `AbortSignal`       | The signal of the evaluation.                                         |

Hooks and the cache `key` function receive this context.

## Errors

Evaluations return these errors in `details().error` and never throw them. Each class has a literal `_tag` equal to its name.

| Error                    | Fields                                   | When                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IdentityNotFoundError`  | `cause`                                  | `identify` returned nothing or threw, `for` received no identity, or the identity has no non-empty string or finite number `distinctId`. `cause` holds what `identify` threw, or a `TypeError` for the `distinctId`.                                                                                                                                                                                    |
| `InvalidDecisionError`   | `decision`, `problem`, `reason`, `cause` | The decision does not fit the flag. `problem` is `"malformed"`, `"kind"` for the other kind, `"variant"` for a variant that the flag does not allow, `"payload"` for a payload that the parser rejects, or `"missing"` for a key that a `decide` result leaves out. `reason` describes it for people. For `"payload"`, `cause` holds what the parser threw. For `"missing"`, `decision` is `undefined`. |
| `ProviderFailedError`    | `provider`, `cause`                      | `decide` or `decideOne` threw or rejected. `provider` is the provider's `name`.                                                                                                                                                                                                                                                                                                                         |
| `EvaluationTimeoutError` | `timeout`                                | The deadline passed. `timeout` holds the deadline in milliseconds.                                                                                                                                                                                                                                                                                                                                      |
| `EvaluationAbortedError` | `cause`                                  | The caller's signal aborted. `cause` holds the signal's reason.                                                                                                                                                                                                                                                                                                                                         |

`EvaluationError` is the union of these classes.

`FlagDefinitionError`, with a `reason` field, is thrown by `flag.boolean`, `flag.variant`, `defineProvider`, and `createFlags` for an invalid definition, and by `FlagsProvider` for an invalid `cache` prop. `@sanely/flags/react` exports `FlagsProviderMissingError`, which the hooks and `FeatureFlag` throw outside a `FlagsProvider`.

## Error reports

`onError` receives an `ErrorReport`, a union of three reports with a literal `_tag`:

| Report            | Fields                                                                                  | When                                                                                                                                                                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HookFailed`      | `phase`, `hookIndex`, `error`, `context`                                                | A hook threw or rejected. The other hooks still run, and the result does not change.                                                                                                                                                                     |
| `StoreFailed`     | `operation`, `key`, `flagKey`, `identity`, `error`, or `operation`, `flagKeys`, `error` | A store operation or the `key` function failed. `operation` is `"get"`, `"set"`, `"delete"`, `"validate"`, or `"key"` for one entry. For `"key"`, `key` holds the flag key. For `"deleteFlags"`, `flagKeys` holds the changed flag keys, or `undefined`. |
| `SubscribeFailed` | `error`                                                                                 | The provider's `subscribe` threw. Evaluations continue without live invalidation.                                                                                                                                                                        |

## Types

| Type                                                                                    | Describes                                                                        |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `Flag`, `BooleanFlag`, `VariantFlag<TVariant, TPayload>`                                | Flag definitions.                                                                |
| `FlagValue<TFlag>`, `FlagPayload<TFlag>`, `FlagValues<TFlags>`                          | The value, payload, and value tuple of flags.                                    |
| `Provider<TIdentity>`, `ProviderDefinition<TIdentity>`, `DecideOptions`                 | A provider, what `defineProvider` takes, and the provider call options.          |
| `Decision`, `DecisionSource`                                                            | A decision, and `"cache" \| "provider"`.                                         |
| `Flags`, `CallerFlags`, `FlagReader`, `FlagsOptions`, `ReadOptions`                     | Readers and their options.                                                       |
| `EvaluationDetails`, `EvaluationError`, `InvalidDecisionProblem`                        | Evaluation results, and the `problem` values of `InvalidDecisionError`.          |
| `FlagSnapshot`, `FlagSnapshotEntry`                                                     | Snapshots.                                                                       |
| `Identity`, `IdentityValue`, `Anonymous`, `Subject`, `EvaluationContext`                | Identities and the evaluation context.                                           |
| `Hook`, `HookFailedReport`, `StoreFailedReport`, `SubscribeFailedReport`, `ErrorReport` | Hooks and error reports.                                                         |
| `CacheOptions`, `DecisionStore`                                                         | The `cache` option and its store.                                                |
| `FlagCacheKey`                                                                          | A string, number, boolean, `null`, `undefined`, array, or plain record of these. |
| `ChangeListener`                                                                        | `(keys?: readonly string[]) => void`.                                            |
| `MaybePromise<T>`                                                                       | `T \| Promise<T>`.                                                               |

## `@sanely/flags/react`

Every export is client-only. The module has a `"use client"` directive. A component that reads a flag without a snapshot needs a Suspense boundary.

### `FlagsProvider`

| Prop       | Type                       | Description                                                                                                                |
| ---------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `flags`    | `Flags` or `CallerFlags`   | The reader from `createFlags`.                                                                                             |
| `identity` | The reader's identity type | Evaluates for this identity. Optional for `Flags`, which can use `identify`. Required for `CallerFlags`.                   |
| `snapshot` | `FlagSnapshot`             | Values for the first render. Ignored when its `distinctId` differs from `identity`. Read only when `FlagsProvider` mounts. |
| `cache`    | `FlagCacheOptions`         | The limits of the flag cache.                                                                                              |
| `children` | `ReactNode`                | The subtree.                                                                                                               |

Each mount creates its own flag cache, so a server never shares one between requests. A `FlagsProvider` without `identity` accepts any snapshot, because its reader resolves the identity itself.

The flag cache keys an `identity` prop the way the reader's store keys a decision: by the type and value of `distinctId`, and by what the reader's [cache `key` function](#cacheoptions) returns for each flag. Two identities with the same `distinctId` and the same `key` output share their entries, even when other fields differ. A change to another field, such as a plan that the `key` function does not return, keeps the cached values. To make a field start new entries, return it from the `key` function. The cache reads no other identity field, so an identity can hold any value that `Identity` allows, such as a `Date` or a `bigint`. When the `key` function throws, the entries of that identity object are shared with no other identity, and the reader reports the failure when it evaluates.

Without the prop, every result of `identify` shares one key, so the cache does not see a change of user. `FlagsProvider` reads `cache` when it mounts and when the `flags` prop changes. A new `flags` reader gets a new flag cache without the snapshot.

### `FlagCacheOptions`

| Option       | Type                                  | Default  | Description                                                                                                                           |
| ------------ | ------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `maxEntries` | `number`                              | `100`    | The most settled entries, one for each identity key, that each list of flags keeps. Pending entries do not count. A positive integer. |
| `ttl`        | `number \| ValidateTimeExpression<T>` | `300000` | How long an evaluation stays cached, in milliseconds or as a time expression such as `"5m"`.                                          |
| `pendingTtl` | `number \| ValidateTimeExpression<T>` | None     | How long a pending evaluation stays before the cache can remove it, such as `"30s"`. Removal does not cancel the evaluation.          |

An invalid option throws `FlagDefinitionError`. `ttl` and `pendingTtl` must be positive. An expired entry does not re-render its readers. The next render evaluates again.

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

Returns `FlagCacheControls` for the nearest `FlagsProvider`. `prefetch` and `invalidate` act on its current identity, and `clear` acts on every identity:

| Method              | Description                                                                                                                                                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prefetch(flags)`   | Evaluates the flags into the cache, so a later `useFlag` or `useFlags` with the same flags in the same order does not suspend. It evaluates even when the snapshot has the flags, and the hooks still read the snapshot first.                                                        |
| `invalidate(flags)` | Drops the cached values of these flags, including their snapshot entries, and re-renders their readers. It covers every set of key fields that the flag cache holds for the identity's `distinctId`, and the next evaluation of each reads fresh, so it skips the reader's store too. |
| `clear()`           | Drops every cached value and the snapshot. The next evaluations read fresh.                                                                                                                                                                                                           |

### React types

| Type                                       | Describes                                                |
| ------------------------------------------ | -------------------------------------------------------- |
| `FlagsProviderProps<TFlags, T, TIdentity>` | The props of `FlagsProvider`. Only `TFlags` is required. |
| `FeatureFlagProps<TFlag>`                  | The props of `FeatureFlag`.                              |
| `FlagCacheControls`                        | The value that `useFlagCache` returns.                   |
| `FlagCacheOptions<T>`                      | The `cache` prop of `FlagsProvider`.                     |

## `@sanely/flags/testing`

### `fakeProvider(entries?)`

```ts
function fakeProvider<const TFlags extends readonly Flag[]>(entries?: {
  readonly [K in keyof TFlags]: readonly [
    flag: TFlags[K],
    value: FlagValue<TFlags[K]>,
    payload?: unknown,
  ]
}): FakeProvider
```

Returns a provider named `"fake"` that answers with the values you give. TypeScript checks each value against its flag. It decides with `decide`, so the flags of one provider request share one call. A flag without a value returns its default with an `InvalidDecisionError` whose `problem` is `"missing"`. The provider accepts any identity and `anonymous`.

`FakeProvider` adds `set(flag, value, payload?)`, which changes a flag's value and notifies the reader's change listeners.

### `memoryStore()`

Returns a `DecisionStore` that keeps decisions in a `Map`. It has `delete` and `deleteFlags`, so a change notification clears the changed flags. It never expires a decision.
