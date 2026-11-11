import type { ChangeListener } from "#lib/changes/index.ts"
import type { FlagReader } from "#lib/flags/index.ts"

/**
 * What `FlagsProvider` needs from the value that `createFlags` returns.
 */
export type AnyFlags = {
  for(identity: never): FlagReader
  subscribe(listener: ChangeListener): () => void
}

/**
 * Counts the change notifications of one reader and records when each flag last changed. It listens
 * for the lifetime of the reader, so it also covers entries that no component reads.
 */
export type ChangeClock = {
  allChangedAt: number
  changedAt: Map<string, number>
  count: number
}

/**
 * The flags of one cache entry and the change count when its evaluation started. A read drops the
 * entry when one of these flags changed later.
 */
export type ChangeWatch = { clock: ChangeClock; keys: readonly string[]; since: number }

const changeClocks = new WeakMap<AnyFlags, ChangeClock>()

/**
 * Returns the change clock of a reader. It attaches once and never detaches, because an entry can
 * outlive every component that reads it.
 */
export function getChangeClock(flags: AnyFlags): ChangeClock {
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

export function changedSince({ clock, keys, since }: ChangeWatch): boolean {
  return clock.allChangedAt > since || keys.some((key) => (clock.changedAt.get(key) ?? 0) > since)
}
