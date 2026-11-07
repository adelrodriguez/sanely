"use client"

import {
  createContext,
  type ReactNode,
  Suspense,
  use,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react"
import type {
  AnyFlagEvaluator,
  EvaluationDetails,
  FlagEvaluator,
  Identity,
} from "#lib/types/index.ts"
import { type EvaluatorFactoryRef, getEvaluatorRecord } from "#lib/flag/registry.ts"
import { evictOnRejection, type FlagCacheOptions } from "#lib/promise-cache/index.ts"
import { type FlagCacheKey, serializeKey } from "#lib/promise-cache/key.ts"
import { ForeignFlagEvaluatorError } from "#lib/shared/errors.ts"
import { isDevelopmentEnvironment } from "#lib/shared/utils.ts"

export type FlagValueOf<TFlag> = TFlag extends (...args: never[]) => Promise<infer TValue>
  ? TValue
  : never
export type FlagIdentityOf<TFlag> =
  TFlag extends FlagEvaluator<
    infer TIdentity,
    boolean | string,
    infer _TCallIdentity,
    unknown,
    infer _TRequired
  >
    ? TIdentity
    : never
export type FlagDetailsOf<TFlag> = TFlag extends {
  details: (...args: never[]) => Promise<infer TDetails>
}
  ? TDetails
  : never
export type FlagBatchValuesOf<TFlags extends readonly AnyFlagEvaluator[]> = Readonly<{
  [K in keyof TFlags]: FlagValueOf<TFlags[K]>
}>
type FlagIdentityIntersection<TFlag> = (
  TFlag extends unknown ? (identity: FlagIdentityOf<TFlag>) => void : never
) extends (identity: infer TIdentity extends Identity) => void
  ? TIdentity
  : never
/**
 * The identity that every flag in the batch accepts: the intersection of the flag identity types.
 * An empty batch accepts any `Identity`.
 */
export type FlagBatchIdentityOf<TFlags extends readonly AnyFlagEvaluator[]> = [
  TFlags[number],
] extends [never]
  ? Identity
  : FlagIdentityIntersection<TFlags[number]>
export type ReactFlagCacheKey = FlagCacheKey
export type ReactFlagCacheOptions = FlagCacheOptions

type VersionStore = {
  bump: () => void
  getSnapshot: () => number
  subscribe: (listener: () => void) => () => void
}

/**
 * Counts the change notifications of one flag factory and records when each flag last changed. It
 * listens for the lifetime of the factory, so it also covers entries that no component reads.
 */
type ChangeClock = {
  allChangedAt: number
  attached: boolean
  changedAt: Map<string, number>
  count: number
}

/**
 * The flags of one cache entry and the change count when its evaluation started. A read drops the
 * entry when one of these flags changed later.
 */
type ChangeWatch = { clock: ChangeClock; keys: readonly string[]; since: number }

type CacheEntry = {
  expiresAt?: number
  pendingExpiresAt?: number
  promise: Promise<unknown>
  settled: boolean
  watch?: ChangeWatch
}

type Bucket = {
  entries: Map<string, CacheEntry>
  stores: Map<string, VersionStore>
}

export type ReactFlagCache = {
  clear(): void
  invalidate<TFlag extends AnyFlagEvaluator>(flag: TFlag, identity?: FlagIdentityOf<TFlag>): void
  invalidateBatch<TFlags extends readonly AnyFlagEvaluator[]>(
    flags: TFlags,
    identity?: FlagBatchIdentityOf<TFlags>
  ): void
  invalidateKey(key: ReactFlagCacheKey): void
  prefetch<TFlag extends AnyFlagEvaluator>(
    flag: TFlag,
    options?: { identity?: FlagIdentityOf<TFlag>; ttlMs?: number }
  ): Promise<void>
  prefetchBatch<TFlags extends readonly AnyFlagEvaluator[]>(
    flags: TFlags,
    options?: { identity?: FlagBatchIdentityOf<TFlags>; ttlMs?: number }
  ): Promise<void>
}

type InternalFlagCache = ReactFlagCache & {
  allBuckets: Set<Bucket>
  batchBuckets: WeakMap<object, Bucket>
  customBucket: Bucket
  flagBuckets: WeakMap<object, Bucket>
  options: Required<Pick<FlagCacheOptions, "maxEntries" | "ttlMs">>
    & Pick<FlagCacheOptions, "pendingTtlMs">
}

const IDENTIFY_SENTINEL = "identify:core"
const DEFAULT_MAX_ENTRIES = 100
const DEFAULT_TTL_MS = 5 * 60 * 1000
const emptySnapshot = (): number => 0
const emptySubscribe = (): (() => null) => () => null
const EMPTY_VERSION_STORE: VersionStore = {
  bump: () => null,
  getSnapshot: emptySnapshot,
  subscribe: emptySubscribe,
}

function assertCacheOptions(options: FlagCacheOptions): void {
  const { maxEntries = DEFAULT_MAX_ENTRIES, pendingTtlMs, ttlMs = DEFAULT_TTL_MS } = options
  if (!Number.isFinite(maxEntries) || maxEntries <= 0 || !Number.isInteger(maxEntries)) {
    throw new RangeError("maxEntries must be a positive finite integer")
  }
  if (pendingTtlMs !== undefined && (!Number.isFinite(pendingTtlMs) || pendingTtlMs <= 0)) {
    throw new RangeError("pendingTtlMs must be a positive finite number")
  }
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new RangeError("ttlMs must be a positive finite number")
  }
}

function createBucket(): Bucket {
  return { entries: new Map(), stores: new Map() }
}

function identityKey(identity: Identity | undefined): string {
  return identity === undefined ? IDENTIFY_SENTINEL : serializeKey(identity, "identity")
}

// Evaluators with one flag key can differ in shape, default, and timeout, so a batch entry belongs
// to its exact evaluators in order. A new array of the same evaluators reads the same entry.
const evaluatorIds = new WeakMap<object, number>()
let nextEvaluatorId = 0

function evaluatorId(flag: object): number {
  let id = evaluatorIds.get(flag)
  if (id === undefined) {
    id = nextEvaluatorId
    nextEvaluatorId += 1
    evaluatorIds.set(flag, id)
  }
  return id
}

function batchKey(flags: readonly AnyFlagEvaluator[], identity?: Identity): string {
  return serializeKey([flags.map((flag) => evaluatorId(flag)), identityKey(identity)], "cacheKey")
}

function getBucket(cache: InternalFlagCache, flag: object): Bucket {
  let bucket = cache.flagBuckets.get(flag)
  if (!bucket) {
    bucket = createBucket()
    cache.flagBuckets.set(flag, bucket)
    cache.allBuckets.add(bucket)
  }
  return bucket
}

function getBatchBucket(cache: InternalFlagCache, flags: readonly AnyFlagEvaluator[]): Bucket {
  const ref = validateBatch(flags)
  let bucket = cache.batchBuckets.get(ref)
  if (!bucket) {
    bucket = createBucket()
    cache.batchBuckets.set(ref, bucket)
    cache.allBuckets.add(bucket)
  }
  return bucket
}

const changeClocks = new WeakMap<EvaluatorFactoryRef, ChangeClock>()

/**
 * Returns the change clock of the factory and attaches it when it is not attached yet. A throwing
 * `subscribe` is reported through `onCacheError`, and the evaluation continues without live
 * invalidation, as in the core. The clock stays detached, so the next new entry tries again, and
 * the entries made before then share the clock that a later attachment updates.
 */
function getChangeClock(ref: EvaluatorFactoryRef, flagKey: string): ChangeClock {
  let clock = changeClocks.get(ref)
  if (!clock) {
    clock = { allChangedAt: 0, attached: false, changedAt: new Map(), count: 0 }
    changeClocks.set(ref, clock)
  }
  if (clock.attached) return clock
  const attaching = clock
  try {
    // Never detached: an entry can outlive every component that reads it, in any flag cache.
    ref.changes.subscribe((keys) => {
      attaching.count += 1
      if (keys === undefined) {
        attaching.allChangedAt = attaching.count
        return
      }
      for (const key of keys) attaching.changedAt.set(key, attaching.count)
    })
    attaching.attached = true
  } catch (error) {
    ref.reportSubscribeError(flagKey, error)
  }
  return attaching
}

function watchChanges(flags: readonly object[]): ChangeWatch | undefined {
  const records = flags.map((flag) => getEvaluatorRecord(flag))
  const [first] = records
  if (!first) return undefined
  const clock = getChangeClock(first.factoryRef, first.options.key)
  return { clock, keys: records.map((record) => record?.options.key ?? ""), since: clock.count }
}

function changedSince({ clock, keys, since }: ChangeWatch): boolean {
  return clock.allChangedAt > since || keys.some((key) => (clock.changedAt.get(key) ?? 0) > since)
}

function deleteAndBump(bucket: Bucket, key: string): void {
  bucket.entries.delete(key)
  bucket.stores.get(key)?.bump()
}

function readEntry(bucket: Bucket, key: string): Promise<unknown> | undefined {
  const entry = bucket.entries.get(key)
  if (!entry) return undefined
  const now = Date.now()
  if (
    (!entry.settled && entry.pendingExpiresAt !== undefined && now >= entry.pendingExpiresAt)
    || (entry.settled && entry.expiresAt !== undefined && now >= entry.expiresAt)
    || (entry.watch !== undefined && changedSince(entry.watch))
  ) {
    bucket.entries.delete(key)
    return undefined
  }
  bucket.entries.delete(key)
  bucket.entries.set(key, entry)
  return entry.promise
}

function setEntry(
  cache: InternalFlagCache,
  bucket: Bucket,
  key: string,
  promise: Promise<unknown>,
  ttlMs: number | undefined,
  watch: ChangeWatch | undefined
): Promise<unknown> {
  const entry: CacheEntry = {
    pendingExpiresAt:
      cache.options.pendingTtlMs === undefined
        ? undefined
        : Date.now() + cache.options.pendingTtlMs,
    promise,
    settled: false,
    watch,
  }
  bucket.entries.set(key, entry)
  void promise.then(
    () => {
      entry.settled = true
      entry.pendingExpiresAt = undefined
      entry.expiresAt = Date.now() + (ttlMs ?? cache.options.ttlMs)
      setTimeout(() => {
        prune(cache, bucket)
      }, 0)
      return null
    },
    () => {
      entry.settled = true
      entry.pendingExpiresAt = undefined
      entry.expiresAt = Date.now() + (ttlMs ?? cache.options.ttlMs)
      setTimeout(() => {
        prune(cache, bucket)
      }, 0)
      return null
    }
  )
  prune(cache, bucket)
  return promise
}

function prune(cache: InternalFlagCache, bucket: Bucket): void {
  const now = Date.now()
  for (const [key, entry] of bucket.entries) {
    if (
      (!entry.settled && entry.pendingExpiresAt !== undefined && now >= entry.pendingExpiresAt)
      || (entry.settled && entry.expiresAt !== undefined && now >= entry.expiresAt)
    ) {
      bucket.entries.delete(key)
    }
  }
  while (bucket.entries.size > cache.options.maxEntries) {
    const settled = [...bucket.entries].find(([, entry]) => entry.settled)
    if (!settled) break
    bucket.entries.delete(settled[0])
  }
}

function evaluateFlag(flag: AnyFlagEvaluator, identity?: Identity): Promise<unknown> {
  const details = flag.details as (options?: { identity?: Identity }) => Promise<unknown>
  return identity === undefined ? details() : details({ identity })
}

function validateBatch(flags: readonly AnyFlagEvaluator[]) {
  const ref = flags[0] ? getEvaluatorRecord(flags[0])?.factoryRef : undefined
  if (!ref || flags.some((flag) => getEvaluatorRecord(flag)?.factoryRef !== ref)) {
    throw new ForeignFlagEvaluatorError()
  }
  return ref
}

function evaluateBatch(flags: readonly AnyFlagEvaluator[], identity?: Identity): Promise<unknown> {
  const ref = validateBatch(flags)
  return ref.batch(flags, identity === undefined ? undefined : ({ identity } as never))
}

export function createFlagCache(options: ReactFlagCacheOptions = {}): ReactFlagCache {
  assertCacheOptions(options)
  const buckets = new Set<Bucket>()
  const cache: InternalFlagCache = {
    allBuckets: buckets,
    batchBuckets: new WeakMap(),
    clear() {
      for (const bucket of buckets) {
        bucket.entries.clear()
        for (const store of bucket.stores.values()) store.bump()
      }
    },
    customBucket: createBucket(),
    flagBuckets: new WeakMap(),
    invalidate(flag, identity) {
      const bucket = getBucket(cache, flag)
      buckets.add(bucket)
      deleteAndBump(bucket, identityKey(identity))
    },
    invalidateBatch(flags, identity) {
      if (flags.length === 0) return
      const bucket = getBatchBucket(cache, flags)
      deleteAndBump(bucket, batchKey(flags, identity))
    },
    invalidateKey(key) {
      deleteAndBump(cache.customBucket, serializeKey(key, "cacheKey"))
    },
    options: {
      maxEntries: options.maxEntries ?? DEFAULT_MAX_ENTRIES,
      pendingTtlMs: options.pendingTtlMs,
      ttlMs: options.ttlMs ?? DEFAULT_TTL_MS,
    },
    async prefetch(flag, prefetchOptions = {}) {
      const bucket = getBucket(cache, flag)
      buckets.add(bucket)
      const key = identityKey(prefetchOptions.identity)
      let promise = readEntry(bucket, key)
      promise ??= createCachedEvaluation(
        cache,
        bucket,
        key,
        () => evaluateFlag(flag, prefetchOptions.identity),
        prefetchOptions.ttlMs,
        watchChanges([flag])
      )
      await promise
    },
    async prefetchBatch(flags, prefetchOptions = {}) {
      if (flags.length === 0) return
      const bucket = getBatchBucket(cache, flags)
      const key = batchKey(flags, prefetchOptions.identity)
      let promise = readEntry(bucket, key)
      promise ??= createCachedEvaluation(
        cache,
        bucket,
        key,
        () => evaluateBatch(flags, prefetchOptions.identity),
        prefetchOptions.ttlMs,
        watchChanges(flags)
      )
      await promise
    },
  }
  buckets.add(cache.customBucket)
  return cache
}

function createCachedEvaluation(
  cache: InternalFlagCache,
  bucket: Bucket,
  key: string,
  evaluate: () => Promise<unknown>,
  ttlMs: number | undefined,
  watch: ChangeWatch | undefined
): Promise<unknown> {
  const cachedEvaluation = evictOnRejection(evaluate(), () => {
    setTimeout(() => {
      if (readEntry(bucket, key) === cachedEvaluation) bucket.entries.delete(key)
    }, 0)
  })
  return setEntry(cache, bucket, key, cachedEvaluation, ttlMs, watch)
}

// `binding` marks the identity of a `createFlagHooks` provider, so its hooks never read an
// untyped identity from a plain `FlagProvider`.
type FlagContextValue = { binding?: object; cache: ReactFlagCache; identity?: Identity }
const defaultCache = createFlagCache()
const FlagContext = createContext<FlagContextValue | undefined>(undefined)
let didWarnAboutServerDefaultCache = false

type FlagProviderProps<TIdentity extends Identity> = {
  cache?: ReactFlagCache
  identity?: TIdentity
  children: ReactNode
}

function FlagContextProvider({
  binding,
  cache: suppliedCache,
  identity,
  children,
}: FlagProviderProps<Identity> & { binding?: object }): ReactNode {
  // oxlint-disable-next-line react/hook-use-state -- The mounted cache is never replaced, and useState is the only hook that guarantees a stable identity across renders.
  const [mountedCache] = useState(createFlagCache)
  const value = useMemo(
    () => ({ binding, cache: suppliedCache ?? mountedCache, identity }),
    [binding, identity, mountedCache, suppliedCache]
  )
  return <FlagContext value={value}>{children}</FlagContext>
}

/**
 * Supplies the flag cache and a default identity to flag consumers below it.
 *
 * TypeScript does not check `identity` against the identity type of the flags. Use the provider
 * from `createFlagHooks` when the flags require a specific identity type.
 */
export function FlagProvider(props: FlagProviderProps<Identity>): ReactNode {
  return <FlagContextProvider {...props} />
}

function useFlagContext(): FlagContextValue {
  const context = use(FlagContext)
  if (!context) {
    if (
      !didWarnAboutServerDefaultCache
      && isDevelopmentEnvironment()
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- Server runtimes do not define window.
      && globalThis.window === undefined
    ) {
      didWarnAboutServerDefaultCache = true
      // oxlint-disable-next-line no-console -- Development-only SSR safety warning.
      console.error(
        "useFlag is using the shared default cache during server rendering. Mount FlagProvider above the consumer Suspense boundary."
      )
    }
    return { cache: defaultCache }
  }
  return context
}

function bindCacheIdentity(cache: ReactFlagCache, identity: Identity): ReactFlagCache {
  return {
    clear() {
      cache.clear()
    },
    invalidate(flag, flagIdentity = identity as never) {
      cache.invalidate(flag, flagIdentity)
    },
    invalidateBatch(flags, batchIdentity = identity as never) {
      cache.invalidateBatch(flags, batchIdentity)
    },
    invalidateKey(key) {
      cache.invalidateKey(key)
    },
    prefetch(flag, options) {
      return cache.prefetch(flag, {
        ...options,
        identity: options?.identity ?? (identity as never),
      })
    },
    prefetchBatch(flags, options) {
      return cache.prefetchBatch(flags, {
        ...options,
        identity: options?.identity ?? (identity as never),
      })
    },
  }
}

export function useFlagCache(): ReactFlagCache {
  const { cache, identity } = useFlagContext()
  return useMemo(
    () => (identity === undefined ? cache : bindCacheIdentity(cache, identity)),
    [cache, identity]
  )
}

function getVersionStore(
  bucket: Bucket,
  key: string,
  onFirstSubscribe?: (bump: () => void) => () => void
): VersionStore {
  const existing = bucket.stores.get(key)
  if (existing) return existing
  let version = 0
  const listeners = new Set<() => void>()
  let detach: (() => void) | undefined
  const store: VersionStore = {
    bump: () => {
      bucket.entries.delete(key)
      version += 1
      for (const listener of listeners) listener()
    },
    getSnapshot: () => version,
    subscribe: (listener) => {
      listeners.add(listener)
      if (listeners.size === 1) detach = onFirstSubscribe?.(store.bump)
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) {
          detach?.()
          detach = undefined
          // Do not evict a newer store that reused this key after the last unsubscribe.
          if (bucket.stores.get(key) === store) bucket.stores.delete(key)
        }
      }
    },
  }
  bucket.stores.set(key, store)
  return store
}

function changesSubscriber(flags: readonly AnyFlagEvaluator[]) {
  const first = flags[0] ? getEvaluatorRecord(flags[0]) : undefined
  const keys = new Set(flags.map((flag) => getEvaluatorRecord(flag)?.options.key))
  return (bump: () => void): (() => void) => {
    if (!first) return () => null
    try {
      return first.factoryRef.changes.subscribe((changedKeys) => {
        if (changedKeys === undefined || changedKeys.some((key) => keys.has(key))) bump()
      })
    } catch (error) {
      // The component keeps its value without re-rendering on changes, as the core evaluation
      // continues without invalidation.
      first.factoryRef.reportSubscribeError(first.options.key, error)
      return () => null
    }
  }
}

export function useFlag<TFlag extends AnyFlagEvaluator>(
  flag: TFlag,
  options?: { identity?: FlagIdentityOf<TFlag>; ttlMs?: number; details?: false }
): FlagValueOf<TFlag>
export function useFlag<TFlag extends AnyFlagEvaluator>(
  flag: TFlag,
  options: { identity?: FlagIdentityOf<TFlag>; ttlMs?: number; details: true }
): FlagDetailsOf<TFlag>
export function useFlag<TValue>(
  fn: () => Promise<TValue>,
  options: { key: ReactFlagCacheKey; ttlMs?: number }
): TValue
export function useFlag(
  input: AnyFlagEvaluator | (() => Promise<unknown>),
  options: {
    identity?: Identity
    ttlMs?: number
    details?: boolean
    key?: ReactFlagCacheKey
  } = {}
): unknown {
  const context = useFlagContext()
  return useFlagWithIdentity(context.cache, input, options, options.identity ?? context.identity)
}

function useFlagWithIdentity(
  contextCache: ReactFlagCache,
  input: AnyFlagEvaluator | (() => Promise<unknown>),
  options: { ttlMs?: number; details?: boolean; key?: ReactFlagCacheKey },
  identity: Identity | undefined
): unknown {
  const cache = contextCache as InternalFlagCache
  const evaluator = getEvaluatorRecord(input) !== undefined
  if (!evaluator && !("key" in options)) {
    throw new TypeError("useFlag(fn, options) requires a key option")
  }
  const bucket = evaluator ? getBucket(cache, input) : cache.customBucket
  const key = evaluator ? identityKey(identity) : serializeKey(options.key, "cacheKey")
  const store = getVersionStore(
    bucket,
    key,
    evaluator ? changesSubscriber([input as AnyFlagEvaluator]) : undefined
  )
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  let promise = readEntry(bucket, key)
  promise ??= createCachedEvaluation(
    cache,
    bucket,
    key,
    evaluator
      ? () => evaluateFlag(input as AnyFlagEvaluator, identity)
      : (input as () => Promise<unknown>),
    options.ttlMs,
    evaluator ? watchChanges([input]) : undefined
  )
  const result = use(promise)
  return evaluator && !options.details
    ? (result as EvaluationDetails<boolean | string>).value
    : result
}

export function useFlagBatch<const TFlags extends readonly AnyFlagEvaluator[]>(
  flags: TFlags,
  options: { identity?: FlagBatchIdentityOf<TFlags>; ttlMs?: number } = {}
): FlagBatchValuesOf<TFlags> {
  const context = useFlagContext()
  return useFlagBatchWithIdentity(
    context.cache,
    flags,
    options.ttlMs,
    options.identity ?? context.identity
  )
}

function useFlagBatchWithIdentity<const TFlags extends readonly AnyFlagEvaluator[]>(
  contextCache: ReactFlagCache,
  flags: TFlags,
  ttlMs: number | undefined,
  identity: Identity | undefined
): FlagBatchValuesOf<TFlags> {
  const cache = contextCache as InternalFlagCache
  const bucket = flags.length === 0 ? undefined : getBatchBucket(cache, flags)
  const key = batchKey(flags, identity)
  const store = bucket
    ? getVersionStore(bucket, key, changesSubscriber(flags))
    : EMPTY_VERSION_STORE
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  if (!bucket) return [] as unknown as FlagBatchValuesOf<TFlags>
  let promise = readEntry(bucket, key)
  promise ??= createCachedEvaluation(
    cache,
    bucket,
    key,
    () => evaluateBatch(flags, identity),
    ttlMs,
    watchChanges(flags)
  )
  return use(promise) as FlagBatchValuesOf<TFlags>
}

type FeatureFlagBase<TFlag extends AnyFlagEvaluator> = {
  children: ReactNode
  fallback?: ReactNode
  flag: TFlag
  identity?: FlagIdentityOf<TFlag>
  loading?: ReactNode
}
type FeatureFlagProps<TFlag extends AnyFlagEvaluator> =
  FlagValueOf<TFlag> extends boolean
    ? FeatureFlagBase<TFlag> & { match?: boolean }
    : FeatureFlagBase<TFlag> & { match: FlagValueOf<TFlag> }

type FlagSlotRuntimeProps = {
  children: ReactNode
  fallback?: ReactNode
  flag: AnyFlagEvaluator
  identity?: Identity
  match?: boolean | string
}

function FlagSlot({ children, fallback, flag, identity, match }: FlagSlotRuntimeProps): ReactNode {
  const value = useFlag(flag, { identity } as never)
  if (typeof value === "string" && match === undefined) {
    if (isDevelopmentEnvironment()) {
      // oxlint-disable-next-line no-console -- Development-only JavaScript misuse warning.
      console.error("FeatureFlag requires a match prop when its flag returns a string variant.")
    }
    return fallback
  }
  return value === (match ?? true) ? children : fallback
}

export function FeatureFlag<TFlag extends AnyFlagEvaluator>(
  props: FeatureFlagProps<TFlag>
): ReactNode {
  const { loading, ...slotProps } = props as unknown as FlagSlotRuntimeProps & {
    loading?: ReactNode
  }
  const slot = <FlagSlot {...slotProps} />
  return loading === undefined ? slot : <Suspense fallback={loading}>{slot}</Suspense>
}

type FactoryFlag<
  TIdentity extends Identity,
  TCallIdentity extends TIdentity | null,
  TCallRequired extends boolean,
> = FlagEvaluator<TIdentity, boolean | string, TCallIdentity, unknown, TCallRequired>

/**
 * A provider and flag hooks that TypeScript checks against the identity type of one factory.
 */
export type FlagHooks<
  TIdentity extends Identity,
  TCallIdentity extends TIdentity | null = TIdentity,
  TCallRequired extends boolean = false,
> = {
  /**
   * Supplies the flag cache and a default identity to the hooks from the same `createFlagHooks`
   * call. Plain `useFlag`, `useFlagBatch`, `useFlagCache`, and `FeatureFlag` below it also read the
   * identity.
   */
  FlagProvider: (props: FlagProviderProps<TIdentity>) => ReactNode
  useFlag: {
    <TFlag extends FactoryFlag<TIdentity, TCallIdentity, TCallRequired>>(
      flag: TFlag,
      options?: { identity?: TIdentity; ttlMs?: number; details?: false }
    ): FlagValueOf<TFlag>
    <TFlag extends FactoryFlag<TIdentity, TCallIdentity, TCallRequired>>(
      flag: TFlag,
      options: { identity?: TIdentity; ttlMs?: number; details: true }
    ): FlagDetailsOf<TFlag>
  }
  useFlagBatch: <
    const TFlags extends ReadonlyArray<FactoryFlag<TIdentity, TCallIdentity, TCallRequired>>,
  >(
    flags: TFlags,
    options?: { identity?: TIdentity; ttlMs?: number }
  ) => FlagBatchValuesOf<TFlags>
}

/**
 * Creates a provider and flag hooks typed to the identity of `factory`. The provider rejects an
 * incomplete identity, and the hooks accept only flags with the factory's identity type.
 *
 * The hooks read the identity only from their own provider. Without it, the factory resolves the
 * identity.
 *
 * @example
 *   const flag = createFlags({
 *     identify: () => ({ distinctId: user.id, plan: user.plan }),
 *     decide,
 *   })
 *   export const { FlagProvider, useFlag, useFlagBatch } = createFlagHooks(flag)
 */
export function createFlagHooks<
  TIdentity extends Identity,
  TCallIdentity extends TIdentity | null,
  TCallRequired extends boolean,
>(
  // Only the type is read: a flag factory returns flags of its identity type and call mode.
  _factory: (options: never) => FactoryFlag<TIdentity, TCallIdentity, TCallRequired>
): FlagHooks<TIdentity, TCallIdentity, TCallRequired> {
  const binding = {}
  const useBoundContext = (): { cache: ReactFlagCache; identity?: Identity } => {
    const context = useFlagContext()
    return {
      cache: context.cache,
      identity: context.binding === binding ? context.identity : undefined,
    }
  }
  return {
    FlagProvider: (props) => <FlagContextProvider {...props} binding={binding} />,
    useFlag: (
      flag: AnyFlagEvaluator,
      options: { identity?: Identity; ttlMs?: number; details?: boolean } = {}
    ) => {
      const context = useBoundContext()
      return useFlagWithIdentity(context.cache, flag, options, options.identity ?? context.identity)
    },
    useFlagBatch: (flags, options = {}) => {
      const context = useBoundContext()
      return useFlagBatchWithIdentity(
        context.cache,
        flags,
        options.ttlMs,
        options.identity ?? context.identity
      )
    },
  }
}
