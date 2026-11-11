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
  BooleanFlag,
  Flag,
  FlagValue,
  FlagValues,
  VariantFlag,
} from "#lib/definition/index.ts"
import type { FlagReader, FlagSnapshot } from "#lib/flags/index.ts"
import type { Anonymous, Subject } from "#lib/identity/index.ts"
import type { FlagCacheKey } from "#lib/shared/cache-key.ts"
import type { AnyFlags } from "./clock"
import type { FlagCacheOptions } from "./options"
import {
  type Bucket,
  createFlagCache,
  type FlagsContextValue,
  getBucket,
  getVersionStore,
  identityKey,
  readEntry,
  snapshotApplies,
  storeEntry,
} from "./cache"
import { type FlagResult, readSnapshot } from "./snapshot"
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

type IdentityOf<TFlags extends AnyFlags> = TFlags extends {
  for(identity: infer TIdentity): FlagReader
}
  ? TIdentity
  : never

/**
 * Limits the named fields of an identity to what the flag cache can key. The cache serializes the
 * identity, so a field such as a `Date`, a `bigint`, or a class instance is a type error at the
 * `identity` prop instead of a throw during render. An index signature from `Identity` is left
 * alone, so a value typed as the reader's identity still passes.
 */
// `Anonymous` maps to itself, not `unknown`, so the check of each object in an identity union
// survives the union with `anonymous`: `unknown | X` would accept anything.
type CacheableFields<TSubject> = TSubject extends Anonymous
  ? TSubject
  : {
      readonly [
        K in keyof TSubject as string extends K ? never : number extends K ? never : K
      ]: FlagCacheKey
    }

export type FlagsProviderProps<
  TFlags extends AnyFlags,
  T extends string = never,
  TIdentity extends IdentityOf<TFlags> = IdentityOf<TFlags>,
> = {
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
      identity?: TIdentity & CacheableFields<TIdentity>
    }
  : { identity: TIdentity & CacheableFields<TIdentity> })

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
  const fromSnapshot = snapshotApplies(context) ? readSnapshot(cache.snapshot, flags) : undefined
  if (fromSnapshot) return fromSnapshot
  const promise = readEntry(bucket, context.identityKey) ?? storeEntry(cache, context, bucket)
  return use(promise)
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
export function FlagsProvider<
  TFlags extends AnyFlags,
  const T extends string = never,
  const TIdentity extends IdentityOf<TFlags> & Subject = IdentityOf<TFlags> & Subject,
>(props: FlagsProviderProps<TFlags, T, TIdentity>): ReactNode {
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
  const value = useMemo<FlagsContextValue>(
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
    // A store that a render made but that React has not subscribed yet is only in `stores`, and
    // a layout effect can drop its entry before the subscription. Bumping it too makes React's
    // subscription check see the change.
    const storesOf = (bucket: Bucket) => new Set([...bucket.active, ...bucket.stores.values()])
    const drop = (bucket: Bucket) => {
      bucket.entries.delete(key)
      for (const store of storesOf(bucket)) {
        if (store.key === key) store.bump()
      }
    }
    return {
      clear() {
        cache.snapshot?.entries.clear()
        // Clear covers the identities that this cache has read for, and the provider's own.
        const identities = new Set([key])
        for (const bucket of cache.buckets.values()) {
          for (const identity of bucket.entries.keys()) identities.add(identity)
          for (const store of storesOf(bucket)) identities.add(store.key)
        }
        cache.fresh.clear(identities)
        for (const bucket of cache.buckets.values()) {
          bucket.entries.clear()
          for (const store of storesOf(bucket)) store.bump()
        }
      },
      invalidate(flags) {
        const keys = new Set(flags.map((flag) => flag.key))
        cache.fresh.mark(key, keys)
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

export type { FlagCacheOptions } from "./options"
