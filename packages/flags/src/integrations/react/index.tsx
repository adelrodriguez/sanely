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
import type { ChangeListener } from "#lib/changes/index.ts"
import type { DecisionSource } from "#lib/definition/decision.ts"
import type { FlagReader, FlagSnapshot, FlagSnapshotEntry } from "#lib/flags/index.ts"
import {
  type BooleanFlag,
  byKind,
  type Flag,
  type FlagValue,
  type FlagValues,
  isFlagKind,
  type VariantFlag,
} from "#lib/definition/index.ts"
import { IdentityNotFoundError } from "#lib/errors/index.ts"
import { anonymous, distinctIdOf, type Subject } from "#lib/identity/index.ts"
import {
  DEFAULT_MAX_ENTRIES,
  DEFAULT_TTL,
  evictOnRejection,
  type FlagCacheOptions,
} from "#lib/promise-cache/index.ts"
import { serializeKey } from "#lib/promise-cache/key.ts"
import { milliseconds } from "#lib/shared/utils.ts"

/**
 * A hook or `FeatureFlag` rendered outside a `FlagsProvider`.
 */
export class FlagsProviderMissingError extends Error {
  static readonly _tag = "FlagsProviderMissingError"
  readonly _tag = FlagsProviderMissingError._tag

  constructor() {
    super("Flag hooks need a FlagsProvider above them")
    this.name = "FlagsProviderMissingError"
  }
}

/**
 * What `FlagsProvider` needs from the value that `createFlags` returns.
 */
type AnyFlags = {
  for(identity: never): FlagReader
  subscribe(listener: ChangeListener): () => void
}

type IdentityOf<TFlags extends AnyFlags> = TFlags extends {
  for(identity: infer TIdentity): FlagReader
}
  ? TIdentity
  : never

export type FlagsProviderProps<TFlags extends AnyFlags, T extends string = never> = {
  /**
   * The reader from `createFlags`.
   */
  flags: TFlags
  /**
   * Server-evaluated values for the first render. The provider ignores a snapshot made for another
   * identity, and it reads the snapshot only when it mounts.
   */
  snapshot?: FlagSnapshot
  cache?: FlagCacheOptions<T>
  children: ReactNode
} & (TFlags extends FlagReader
  ? {
      /**
       * Evaluates for this identity instead of the reader's `identify`.
       */
      identity?: IdentityOf<TFlags>
    }
  : { identity: IdentityOf<TFlags> })

type VersionStore = {
  bump: () => void
  getSnapshot: () => number
  subscribe: (listener: () => void) => () => void
}

/**
 * Counts the change notifications of one reader and records when each flag last changed. It listens
 * for the lifetime of the reader, so it also covers entries that no component reads.
 */
type ChangeClock = {
  allChangedAt: number
  changedAt: Map<string, number>
  count: number
}

/**
 * The flags of one cache entry and the change count when its evaluation started. A read drops the
 * entry when one of these flags changed later.
 */
type ChangeWatch = { clock: ChangeClock; keys: readonly string[]; since: number }

/**
 * What a hook reads for one flag: its value and where the value came from.
 */
type FlagResult = { source: DecisionSource | "default"; value: boolean | string }

type CacheEntry = {
  expiresAt?: number
  pendingExpiresAt?: number
  promise: Promise<readonly FlagResult[]>
  settled: boolean
  watch: ChangeWatch
}

/**
 * The cache entries of one list of flags, one for each identity.
 */
type Bucket = {
  entries: Map<string, CacheEntry>
  flags: readonly Flag[]
  stores: Map<string, VersionStore>
}

type SnapshotState = {
  distinctId: string | number | null
  entries: Map<string, FlagSnapshotEntry>
  watch: Omit<ChangeWatch, "keys">
}

type FlagCache = {
  buckets: Map<string, Bucket>
  maxEntries: number
  pendingTtl: number | undefined
  snapshot: SnapshotState | undefined
  ttl: number
}

type FlagsContextValue = {
  cache: FlagCache
  flags: AnyFlags
  identity: Subject | undefined
  identityKey: string
}

/**
 * The cache options before parsing. A time option is a number or any string, which `lengthOfTime`
 * parses.
 */
type CacheInput = {
  maxEntries?: number
  pendingTtl?: number | string
  ttl?: number | string
}

function lengthOfTime(option: string, value: unknown): number {
  const parsed = milliseconds(value)
  if (parsed === null || !Number.isFinite(parsed) || parsed <= 0) {
    throw new RangeError(
      `${option} must be a time expression or a positive finite number of milliseconds`
    )
  }
  return parsed
}

function readCacheOptions(options: CacheInput) {
  const { maxEntries = DEFAULT_MAX_ENTRIES, pendingTtl, ttl = DEFAULT_TTL } = options
  if (!Number.isFinite(maxEntries) || maxEntries <= 0 || !Number.isInteger(maxEntries)) {
    throw new RangeError("maxEntries must be a positive finite integer")
  }
  return {
    maxEntries,
    pendingTtl: pendingTtl === undefined ? undefined : lengthOfTime("pendingTtl", pendingTtl),
    ttl: lengthOfTime("ttl", ttl),
  }
}

function identityKey(identity: Subject | undefined): string {
  if (identity === undefined) return "identify"
  if (identity === anonymous) return "anonymous"
  return serializeKey(identity, "identity")
}

// Flags with one key can differ in shape and default, so an entry belongs to its exact flags in
// order. A new array of the same flags reads the same entry.
const flagIds = new WeakMap<Flag, number>()
let nextFlagId = 0

function flagId(flag: Flag): number {
  let id = flagIds.get(flag)
  if (id === undefined) {
    id = nextFlagId
    nextFlagId += 1
    flagIds.set(flag, id)
  }
  return id
}

function getBucket(cache: FlagCache, flags: readonly Flag[]): Bucket {
  const key = flags.map((flag) => flagId(flag)).join(",")
  let bucket = cache.buckets.get(key)
  if (!bucket) {
    bucket = { entries: new Map(), flags, stores: new Map() }
    cache.buckets.set(key, bucket)
  }
  return bucket
}

const changeClocks = new WeakMap<AnyFlags, ChangeClock>()

/**
 * Returns the change clock of a reader. It attaches once and never detaches, because an entry can
 * outlive every component that reads it.
 */
function getChangeClock(flags: AnyFlags): ChangeClock {
  let clock = changeClocks.get(flags)
  if (clock) return clock
  const created: ChangeClock = { allChangedAt: 0, changedAt: new Map(), count: 0 }
  changeClocks.set(flags, created)
  flags.subscribe((keys) => {
    created.count += 1
    if (keys === undefined) {
      created.allChangedAt = created.count
      return
    }
    for (const key of keys) created.changedAt.set(key, created.count)
  })
  clock = created
  return clock
}

function changedSince({ clock, keys, since }: ChangeWatch): boolean {
  return clock.allChangedAt > since || keys.some((key) => (clock.changedAt.get(key) ?? 0) > since)
}

function isExpired(entry: CacheEntry, now: number): boolean {
  return (
    (!entry.settled && entry.pendingExpiresAt !== undefined && now >= entry.pendingExpiresAt)
    || (entry.settled && entry.expiresAt !== undefined && now >= entry.expiresAt)
  )
}

function readEntry(bucket: Bucket, key: string): Promise<readonly FlagResult[]> | undefined {
  const entry = bucket.entries.get(key)
  if (!entry) return undefined
  bucket.entries.delete(key)
  if (isExpired(entry, Date.now()) || changedSince(entry.watch)) {
    return undefined
  }
  // Re-insert to keep the bucket in least recently used order.
  bucket.entries.set(key, entry)
  return entry.promise
}

function prune(cache: FlagCache, bucket: Bucket): void {
  const now = Date.now()
  for (const [key, entry] of bucket.entries) {
    if (isExpired(entry, now)) bucket.entries.delete(key)
  }
  while (bucket.entries.size > cache.maxEntries) {
    const settled = [...bucket.entries].find(([, entry]) => entry.settled)
    if (!settled) break
    bucket.entries.delete(settled[0])
  }
}

// A reader from `createFlags` with `identify` reads directly, and one without it reads only through
// `for`. The check must name a method that only the direct reader has, so the type checker rejects
// a rename here that would send every read through `for` with no identity.
const directReadMethod = "get" satisfies Exclude<keyof FlagReader, keyof AnyFlags>

function isDirectReader(flags: AnyFlags): flags is AnyFlags & FlagReader {
  return directReadMethod in flags
}

function readerOf(context: FlagsContextValue): FlagReader {
  const { flags, identity } = context
  if (identity === undefined && isDirectReader(flags)) {
    return flags
  }
  // A reader without `identify` and without an identity falls back to the defaults with
  // `IdentityNotFoundError`, because `for` rejects a missing identity.
  return flags.for(identity as never)
}

async function evaluateFlags(
  reader: FlagReader,
  flags: readonly Flag[]
): Promise<readonly FlagResult[]> {
  const [single] = flags
  if (flags.length === 1 && single) {
    return [await reader.details(single)]
  }
  return await reader.detailsMany(flags)
}

function storeEntry(
  cache: FlagCache,
  context: FlagsContextValue,
  bucket: Bucket
): Promise<readonly FlagResult[]> {
  const key = context.identityKey
  const clock = getChangeClock(context.flags)
  const watch: ChangeWatch = {
    clock,
    keys: bucket.flags.map((flag) => flag.key),
    since: clock.count,
  }
  const entry: CacheEntry = {
    pendingExpiresAt: cache.pendingTtl === undefined ? undefined : Date.now() + cache.pendingTtl,
    promise: Promise.resolve([]),
    settled: false,
    watch,
  }
  const settle = () => {
    entry.settled = true
    entry.pendingExpiresAt = undefined
    entry.expiresAt = Date.now() + cache.ttl
    setTimeout(() => {
      prune(cache, bucket)
    }, 0)
    return null
  }
  entry.promise = evictOnRejection(evaluateFlags(readerOf(context), bucket.flags), () => {
    setTimeout(() => {
      if (bucket.entries.get(key) === entry) bucket.entries.delete(key)
    }, 0)
  })
  void entry.promise.then(settle, settle)
  bucket.entries.set(key, entry)
  prune(cache, bucket)
  return entry.promise
}

function getVersionStore(context: FlagsContextValue, bucket: Bucket): VersionStore {
  const key = context.identityKey
  const existing = bucket.stores.get(key)
  if (existing) return existing
  const keys = new Set(bucket.flags.map((flag) => flag.key))
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
      if (listeners.size === 1) {
        detach = context.flags.subscribe((changed) => {
          if (changed === undefined || changed.some((changedKey) => keys.has(changedKey))) {
            store.bump()
          }
        })
      }
      return () => {
        listeners.delete(listener)
        // The store stays registered, so `invalidate` and `clear` still reach a reader that React
        // subscribes again, as in strict mode or when one reader replaces another.
        if (listeners.size === 0) {
          detach?.()
          detach = undefined
        }
      }
    },
  }
  bucket.stores.set(key, store)
  return store
}

function snapshotEntry(cache: FlagCache, flag: Flag): FlagSnapshotEntry | undefined {
  const { snapshot } = cache
  const entry = snapshot?.entries.get(flag.key)
  if (!snapshot || !entry || entry.kind !== flag.kind) return undefined
  // The server resolved no identity for this entry, so its default stands for no one. A snapshot
  // made that way also has no distinctId, which an anonymous provider would otherwise accept.
  if (entry.source === "default" && entry.error === IdentityNotFoundError._tag) return undefined
  if (changedSince({ ...snapshot.watch, keys: [flag.key] })) {
    snapshot.entries.delete(flag.key)
    return undefined
  }
  const { value } = entry
  const valid = byKind(flag, {
    boolean: () => typeof value === "boolean",
    variant: ({ variants }) => typeof value === "string" && variants.includes(value),
  })
  return valid ? entry : undefined
}

function readSnapshot(cache: FlagCache, flags: readonly Flag[]): FlagResult[] | undefined {
  const results: FlagResult[] = []
  for (const flag of flags) {
    const entry = snapshotEntry(cache, flag)
    if (!entry) return undefined
    results.push({ source: entry.source, value: entry.value })
  }
  return results
}

const FlagsContext = createContext<FlagsContextValue | undefined>(undefined)

function useFlagsContext(): FlagsContextValue {
  const context = use(FlagsContext)
  if (!context) {
    throw new FlagsProviderMissingError()
  }
  return context
}

function useFlagResults(flags: readonly Flag[]): readonly FlagResult[] {
  const context = useFlagsContext()
  const { cache } = context
  const bucket = getBucket(cache, flags)
  const store = getVersionStore(context, bucket)
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  if (flags.length === 0) return []
  const fromSnapshot = snapshotApplies(context) ? readSnapshot(cache, flags) : undefined
  if (fromSnapshot) return fromSnapshot
  const promise = readEntry(bucket, context.identityKey) ?? storeEntry(cache, context, bucket)
  return use(promise)
}

/**
 * Whether the snapshot was made for the provider's identity. A provider without an identity accepts
 * the snapshot, because its reader resolves the identity itself.
 */
function snapshotApplies(context: FlagsContextValue): boolean {
  const { identity } = context
  const { snapshot } = context.cache
  if (!snapshot) return false
  return identity === undefined || distinctIdOf(identity) === snapshot.distinctId
}

const SNAPSHOT_SOURCES: ReadonlySet<unknown> = new Set<FlagResult["source"]>([
  "cache",
  "default",
  "provider",
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isSnapshotEntry(entry: unknown): entry is FlagSnapshotEntry {
  return (
    isRecord(entry)
    && isFlagKind(entry.kind)
    && SNAPSHOT_SOURCES.has(entry.source)
    && (typeof entry.value === "boolean" || typeof entry.value === "string")
  )
}

/**
 * Reads a snapshot that crossed the network as JSON. A snapshot whose shape does not parse is
 * ignored, and so is each entry that does not, so a bad snapshot costs an evaluation, not a render.
 * `snapshotEntry` checks each entry against its flag when a hook reads it.
 */
function parseSnapshot(
  snapshot: unknown
): Pick<SnapshotState, "distinctId" | "entries"> | undefined {
  if (!isRecord(snapshot) || !isRecord(snapshot.flags)) return undefined
  const { distinctId } = snapshot
  if (distinctId !== null && typeof distinctId !== "string" && typeof distinctId !== "number") {
    return undefined
  }
  const entries = Object.entries(snapshot.flags).filter(
    (pair): pair is [string, FlagSnapshotEntry] => isSnapshotEntry(pair[1])
  )
  return { distinctId, entries: new Map(entries) }
}

/**
 * The state of each snapshot object, so a provider that remounts with the same snapshot keeps the
 * entries that a change or `invalidate` already dropped. A state belongs to one reader's change
 * clock, and a snapshot read with another reader starts over.
 */
const snapshotStates = new WeakMap<object, SnapshotState>()

function snapshotState(snapshot: unknown, clock: ChangeClock): SnapshotState | undefined {
  if (!isRecord(snapshot)) return undefined
  const existing = snapshotStates.get(snapshot)
  if (existing?.watch.clock === clock) return existing
  const parsed = parseSnapshot(snapshot)
  if (!parsed) return undefined
  const state = { ...parsed, watch: { clock, since: clock.count } }
  snapshotStates.set(snapshot, state)
  return state
}

function createFlagCache(
  flags: AnyFlags,
  cacheOptions: CacheInput | undefined,
  snapshot?: FlagSnapshot
): FlagCache {
  const { maxEntries, pendingTtl, ttl } = readCacheOptions(cacheOptions ?? {})
  return {
    buckets: new Map(),
    maxEntries,
    pendingTtl,
    snapshot: snapshotState(snapshot, getChangeClock(flags)),
    ttl,
  }
}

/**
 * Supplies a reader, an identity, and a flag cache to the hooks below it. Each mount has its own
 * cache, so a server never shares one between requests.
 *
 * @example
 *   ;<FlagsProvider flags={flags} identity={user} snapshot={snapshot}>
 *     <App />
 *   </FlagsProvider>
 */
export function FlagsProvider<TFlags extends AnyFlags, const T extends string = never>(
  props: FlagsProviderProps<TFlags, T>
): ReactNode {
  const { cache: cacheOptions, children, flags, snapshot } = props
  const identity: Subject | undefined = props.identity
  const [mounted, setMounted] = useState(() => ({
    cache: createFlagCache(flags, cacheOptions, snapshot),
    flags,
  }))
  let { cache } = mounted
  if (mounted.flags !== flags) {
    // A new reader gets a new cache, so no value or subscription of the old reader carries over.
    // The snapshot belongs to the reader that the provider mounted with.
    const next = { cache: createFlagCache(flags, cacheOptions), flags }
    setMounted(next)
    cache = next.cache
  }
  const key = identityKey(identity)
  const value = useMemo(
    () => ({ cache, flags, identity, identityKey: key }),
    [cache, flags, identity, key]
  )
  return <FlagsContext value={value}>{children}</FlagsContext>
}

/**
 * Reads a flag's value. The component suspends until the value is ready, unless the provider's
 * snapshot has it.
 */
export function useFlag<TFlag extends Flag>(flag: TFlag): FlagValue<TFlag> {
  const [result] = useFlagResults([flag])
  // The value was validated against `flag` by the reader or by the snapshot check.
  return result?.value as FlagValue<TFlag>
}

/**
 * Reads several flags with one suspension and returns their values in order.
 */
export function useFlags<const TFlags extends readonly Flag[]>(flags: TFlags): FlagValues<TFlags> {
  // The values were validated against `flags`, in order, by the reader or the snapshot check.
  return useFlagResults(flags).map((result) => result.value) as FlagValues<TFlags>
}

/**
 * Prefetches, invalidates, and clears the cache of the nearest `FlagsProvider`, for its identity.
 */
export type FlagCacheControls = {
  /**
   * Evaluates the flags into the cache, so a later `useFlag` or `useFlags` with the same flags in
   * the same order does not suspend.
   */
  prefetch(flags: readonly Flag[]): Promise<void>
  /**
   * Drops the cached values of these flags, including from the snapshot, and re-renders their
   * readers.
   */
  invalidate(flags: readonly Flag[]): void
  clear(): void
}

export function useFlagCache(): FlagCacheControls {
  const context = useFlagsContext()
  return useMemo(() => {
    const { cache, identityKey: key } = context
    const drop = (bucket: Bucket) => {
      bucket.entries.delete(key)
      bucket.stores.get(key)?.bump()
    }
    return {
      clear() {
        cache.snapshot?.entries.clear()
        for (const bucket of cache.buckets.values()) {
          bucket.entries.clear()
          for (const store of bucket.stores.values()) store.bump()
        }
      },
      invalidate(flags) {
        const keys = new Set(flags.map((flag) => flag.key))
        for (const flagKey of keys) cache.snapshot?.entries.delete(flagKey)
        for (const bucket of cache.buckets.values()) {
          if (bucket.flags.some((flag) => keys.has(flag.key))) drop(bucket)
        }
      },
      async prefetch(flags) {
        if (flags.length === 0) return
        const bucket = getBucket(cache, flags)
        await (readEntry(bucket, key) ?? storeEntry(cache, context, bucket))
      },
    }
  }, [context])
}

type FeatureFlagBase<TFlag extends Flag> = {
  /**
   * The flag to check.
   */
  flag: TFlag
  children: ReactNode
  /**
   * Renders when the flag does not match, or when its evaluation falls back to the default.
   */
  fallback?: ReactNode
  /**
   * Adds a Suspense boundary with this fallback.
   */
  loading?: ReactNode
}

export type FeatureFlagProps<TFlag extends Flag> = TFlag extends BooleanFlag
  ? FeatureFlagBase<TFlag> & { match?: never }
  : TFlag extends VariantFlag<infer TVariant, infer _TPayload>
    ? FeatureFlagBase<TFlag> & {
        /**
         * The variant that renders the children.
         */
        match: TVariant
      }
    : never

function FlagSlot({
  children,
  fallback,
  flag,
  match,
}: {
  children: ReactNode
  fallback: ReactNode
  flag: Flag
  match: string | undefined
}): ReactNode {
  const [result] = useFlagResults([flag])
  if (!result || result.source === "default") return fallback
  return result.value === (match ?? true) ? children : fallback
}

/**
 * Renders its children when a flag matches: `true` for a boolean flag, or `match` for a variant
 * flag. Renders `fallback` otherwise, and when the evaluation falls back to the default.
 */
export function FeatureFlag<TFlag extends Flag>(props: FeatureFlagProps<TFlag>): ReactNode {
  const { children, fallback, flag, loading } = props
  const match: string | undefined = props.match
  const slot = (
    <FlagSlot fallback={fallback} flag={flag} match={match}>
      {children}
    </FlagSlot>
  )
  return loading === undefined ? slot : <Suspense fallback={loading}>{slot}</Suspense>
}

export type { FlagCacheOptions } from "#lib/promise-cache/index.ts"
