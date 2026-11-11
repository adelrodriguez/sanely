import type { Flag } from "#lib/definition/index.ts"
import { type FlagReader, type FlagSnapshot, keyFieldsOf } from "#lib/flags/index.ts"
import { anonymous, distinctIdOf, type Subject } from "#lib/identity/index.ts"
import { distinctIdKey, getIdentityKey } from "#lib/sharing/evaluation-key.ts"
import { type AnyFlags, type ChangeWatch, getChangeClock, changedSince } from "./clock"
import { type CacheInput, evictOnRejection, readCacheOptions } from "./options"
import { type FlagResult, type SnapshotState, snapshotState } from "./snapshot"

type VersionStore = {
  // The entry key whose entry the store's readers read.
  readonly key: string
  readonly subject: string
  bump: () => void
  getSnapshot: () => number
  subscribe: (listener: () => void) => () => void
}

type CacheEntry = {
  expiresAt?: number
  pendingExpiresAt?: number
  promise: Promise<readonly FlagResult[]>
  settled: boolean
  readonly subject: string
  watch: ChangeWatch
}

/**
 * The cache entries of one list of flags, one for each entry key.
 */
export type Bucket = {
  // Every version store that has a listener. `invalidate` and `clear` bump these, so they reach a
  // reader that holds a store that is no longer the identity's current one.
  active: Set<VersionStore>
  entries: Map<string, CacheEntry>
  flags: readonly Flag[]
  // The store that a render reuses for each identity, while it has a listener.
  stores: Map<string, VersionStore>
}

/**
 * Which flags `invalidate` and `clear` dropped, so that their next evaluation reads fresh and skips
 * the reader's store too. The marks belong to the cache, not to a bucket, so a list of flags that
 * no component has read yet also reads fresh. Each mark is an epoch: a flag reads fresh while its
 * latest mark, or the latest `clear`, is newer than its latest fresh read for that identity.
 *
 * A record belongs to a subject, and it marks each flag by its slot: the flag key and the reader's
 * key fields for that flag. `clear` covers every slot of a subject.
 */
type FreshRead = { epoch: number; start: number }

/**
 * The marks of one subject. `all` is the epoch of the latest `clear` that covered the subject.
 * `started` holds the latest fresh read of each slot, because only that read retires the slot's
 * mark: a newer fresh read voids the store write of an older one.
 */
type FreshRecord = {
  all: number
  marked: Map<string, number>
  read: Map<string, number>
  started: Map<string, number>
}

class FreshMarks {
  #epoch = 0
  #starts = 0
  // Only subjects that `invalidate` or `clear` marked have a record, and a record leaves once
  // nothing is marked or in flight, so reads without marks keep nothing.
  readonly #records = new Map<string, FreshRecord>()

  mark(subject: string, slots: Iterable<string>): void {
    this.#epoch += 1
    const record = this.#recordOf(subject)
    for (const slot of slots) record.marked.set(slot, this.#epoch)
  }

  clear(subjects: Iterable<string>): void {
    this.#epoch += 1
    for (const subject of subjects) this.#recordOf(subject).all = this.#epoch
  }

  /**
   * Starts a fresh read when an evaluation of `slots` for `subject` must read fresh, and returns
   * `undefined` otherwise. It retires no mark, so another list that reads the same flags while this
   * read is in flight also reads fresh.
   */
  begin(subject: string, slots: readonly string[]): FreshRead | undefined {
    const record = this.#records.get(subject)
    if (!record) return undefined
    const stale = slots.some(
      (slot) => Math.max(record.all, record.marked.get(slot) ?? 0) > (record.read.get(slot) ?? 0)
    )
    if (!stale) return undefined
    this.#starts += 1
    for (const slot of slots) record.started.set(slot, this.#starts)
    return { epoch: this.#epoch, start: this.#starts }
  }

  /**
   * Retires the marks of `slots` that `fresh` stored, when it is still the latest fresh read of
   * each slot. Marks made after it started still apply.
   */
  read(subject: string, slots: readonly string[], fresh: FreshRead): void {
    const record = this.#records.get(subject)
    if (!record) return
    for (const slot of slots) {
      if (record.started.get(slot) !== fresh.start) continue
      record.started.delete(slot)
      record.read.set(slot, Math.max(record.read.get(slot) ?? 0, fresh.epoch))
      if ((record.marked.get(slot) ?? 0) <= fresh.epoch) record.marked.delete(slot)
    }
    if (record.all === 0 && record.marked.size === 0 && record.started.size === 0) {
      this.#records.delete(subject)
    }
  }

  #recordOf(subject: string): FreshRecord {
    const record = this.#records.get(subject) ?? {
      all: 0,
      marked: new Map(),
      read: new Map(),
      started: new Map(),
    }
    this.#records.set(subject, record)
    return record
  }
}

type FlagCache = {
  buckets: Map<string, Bucket>
  fresh: FreshMarks
  maxEntries: number
  pendingTtl: number | undefined
  snapshot: SnapshotState | undefined
  ttl: number
}

/**
 * How the flag cache keys the flag provider's identity. It keys an identity the way the reader's
 * store keys a decision: by the type and value of `distinctId`, and by the reader's `key` function
 * for each flag. It reads no other identity field, so it accepts every identity that `Identity`
 * allows.
 */
export type IdentityKeys = {
  /**
   * The identity without its key fields: `identify` for the reader's own identity, `anonymous`, or
   * the typed `distinctId`.
   */
  readonly subject: string
  /**
   * The reader's key fields for one flag, or `""` when the reader has no `key` function.
   */
  fields(flag: Flag): string
}

export type FlagsContextValue = {
  cache: FlagCache
  flags: AnyFlags
  identity: Subject | undefined
  keys: IdentityKeys
}

// The flag cache calls the `key` function outside an evaluation, so no signal ever aborts.
const idle = new AbortController().signal

// A number for each identity object whose `key` function threw, so its entries stay apart from
// every other identity's.
const unkeyedIds = new WeakMap<object, number>()
let nextUnkeyedId = 0

function unkeyedId(identity: object): number {
  let id = unkeyedIds.get(identity)
  if (id === undefined) {
    id = nextUnkeyedId
    nextUnkeyedId += 1
    unkeyedIds.set(identity, id)
  }
  return id
}

export function identityKeys(flags: AnyFlags, identity: Subject | undefined): IdentityKeys {
  if (identity === undefined) return { fields: () => "", subject: "identify" }
  if (identity === anonymous) return { fields: () => "", subject: "anonymous" }
  const key = keyFieldsOf(flags)
  const fields = new Map<Flag, string>()
  return {
    fields(flag) {
      let value = fields.get(flag)
      if (value === undefined) {
        try {
          value = getIdentityKey({ flag, identity, signal: idle }, key)?.fields ?? ""
        } catch {
          // The reader reports the failure when it evaluates, and it then shares no decision. The
          // flag cache shares an entry only for this identity object, which a rerender keeps.
          value = `unkeyed:${unkeyedId(identity)}`
        }
        fields.set(flag, value)
      }
      return value
    },
    subject: JSON.stringify(distinctIdKey(identity)),
  }
}

/**
 * The key of the entry of `flags` for the identity. A JSON subject or `identify` and `anonymous`
 * cannot end inside a field, and each field closes itself, so two keys never collide.
 */
export function entryKey(keys: IdentityKeys, flags: readonly Flag[]): string {
  return `${keys.subject}${flags.map((flag) => keys.fields(flag)).join("")}`
}

/**
 * The fresh-read slot of each flag: its flag key and its key fields.
 */
export function slotsOf(keys: IdentityKeys, flags: readonly Flag[]): string[] {
  return flags.map((flag) => `${JSON.stringify(flag.key)}${keys.fields(flag)}`)
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

export function getBucket(cache: FlagCache, flags: readonly Flag[]): Bucket {
  const key = flags.map((flag) => flagId(flag)).join(",")
  let bucket = cache.buckets.get(key)
  if (!bucket) {
    bucket = { active: new Set(), entries: new Map(), flags, stores: new Map() }
    cache.buckets.set(key, bucket)
  }
  return bucket
}

function isExpired(entry: CacheEntry, now: number): boolean {
  return (
    (!entry.settled && entry.pendingExpiresAt !== undefined && now >= entry.pendingExpiresAt)
    || (entry.settled && entry.expiresAt !== undefined && now >= entry.expiresAt)
  )
}

export function readEntry(bucket: Bucket, key: string): Promise<readonly FlagResult[]> | undefined {
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
  flags: readonly Flag[],
  fresh: boolean
): Promise<readonly FlagResult[]> {
  const [single] = flags
  if (flags.length === 1 && single) {
    return [await reader.details(single, { fresh })]
  }
  return await reader.detailsMany(flags, { fresh })
}

export function storeEntry(
  cache: FlagCache,
  context: FlagsContextValue,
  bucket: Bucket
): Promise<readonly FlagResult[]> {
  const { keys } = context
  const key = entryKey(keys, bucket.flags)
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
    subject: keys.subject,
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
  const freshRead = cache.fresh.begin(keys.subject, slotsOf(keys, bucket.flags))
  const fresh = freshRead !== undefined
  entry.promise = evictOnRejection(evaluateFlags(readerOf(context), bucket.flags, fresh), () => {
    setTimeout(() => {
      if (bucket.entries.get(key) === entry) bucket.entries.delete(key)
    }, 0)
  })
  void entry.promise.then(settle, settle)
  if (freshRead !== undefined) {
    // Only a flag that the provider answered has a fresh stored decision. Another keeps its mark.
    void entry.promise.then(
      (results) => {
        const answered = bucket.flags.filter((_, index) => results[index]?.source === "provider")
        cache.fresh.read(keys.subject, slotsOf(keys, answered), freshRead)
        return null
      },
      () => null
    )
  }
  bucket.entries.set(key, entry)
  prune(cache, bucket)
  return entry.promise
}

export function getVersionStore(context: FlagsContextValue, bucket: Bucket): VersionStore {
  const key = entryKey(context.keys, bucket.flags)
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
    key,
    subject: context.keys.subject,
    subscribe: (listener) => {
      listeners.add(listener)
      if (listeners.size === 1) {
        bucket.active.add(store)
        // A store that React subscribes again becomes the identity's current store again, unless
        // a render already made a newer one.
        if (!bucket.stores.has(key)) bucket.stores.set(key, store)
        detach = context.flags.subscribe((changed) => {
          if (changed === undefined || changed.some((changedKey) => keys.has(changedKey))) {
            store.bump()
          }
        })
      }
      return () => {
        listeners.delete(listener)
        // A store without listeners leaves both maps, so an identity that no reader reads keeps
        // nothing. React can subscribe the same store again, as in strict mode or when one reader
        // replaces another, and `active` then reaches it again.
        if (listeners.size === 0) {
          detach?.()
          detach = undefined
          bucket.active.delete(store)
          if (bucket.stores.get(key) === store) bucket.stores.delete(key)
        }
      }
    },
  }
  bucket.stores.set(key, store)
  return store
}

/**
 * Whether the snapshot was made for the provider's identity. A provider without an identity accepts
 * the snapshot, because its reader resolves the identity itself.
 */
export function snapshotApplies(context: FlagsContextValue): boolean {
  const { identity } = context
  const { snapshot } = context.cache
  if (!snapshot) return false
  return identity === undefined || distinctIdOf(identity) === snapshot.distinctId
}

export function createFlagCache(
  flags: AnyFlags,
  cacheOptions: CacheInput | undefined,
  snapshot?: FlagSnapshot
): FlagCache {
  const { maxEntries, pendingTtl, ttl } = readCacheOptions(cacheOptions ?? {})
  return {
    buckets: new Map(),
    fresh: new FreshMarks(),
    maxEntries,
    pendingTtl,
    snapshot: snapshotState(snapshot, getChangeClock(flags)),
    ttl,
  }
}
