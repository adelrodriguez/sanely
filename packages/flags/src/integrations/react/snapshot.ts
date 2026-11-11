import type { DecisionSource } from "#lib/definition/decision.ts"
import type { FlagSnapshotEntry } from "#lib/flags/index.ts"
import { byKind, type Flag, isFlagKind } from "#lib/definition/index.ts"
import { IdentityNotFoundError } from "#lib/errors/index.ts"
import { type ChangeClock, changedSince, type ChangeWatch } from "./clock"

/**
 * What a hook reads for one flag: its value and where the value came from.
 */
export type FlagResult = { source: DecisionSource | "default"; value: boolean | string }

export type SnapshotState = {
  distinctId: string | number | null
  entries: Map<string, FlagSnapshotEntry>
  watch: Omit<ChangeWatch, "keys">
}

function snapshotEntry(
  snapshot: SnapshotState | undefined,
  flag: Flag
): FlagSnapshotEntry | undefined {
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

export function readSnapshot(
  snapshot: SnapshotState | undefined,
  flags: readonly Flag[]
): FlagResult[] | undefined {
  const results: FlagResult[] = []
  for (const flag of flags) {
    const entry = snapshotEntry(snapshot, flag)
    if (!entry) return undefined
    results.push({ source: entry.source, value: entry.value })
  }
  return results
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
 * The state of each snapshot object for each reader's change clock, so a provider that remounts
 * with the same snapshot keeps the entries that a change or `invalidate` already dropped. Another
 * reader that reads the same snapshot object gets a state of its own and leaves this one alone.
 */
const snapshotStates = new WeakMap<object, WeakMap<ChangeClock, SnapshotState>>()

export function snapshotState(snapshot: unknown, clock: ChangeClock): SnapshotState | undefined {
  if (!isRecord(snapshot)) return undefined
  const states = snapshotStates.get(snapshot) ?? new WeakMap<ChangeClock, SnapshotState>()
  snapshotStates.set(snapshot, states)
  const existing = states.get(clock)
  if (existing) return existing
  const parsed = parseSnapshot(snapshot)
  if (!parsed) return undefined
  const state = { ...parsed, watch: { clock, since: clock.count } }
  states.set(clock, state)
  return state
}
