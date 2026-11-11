import type { ChangeListener } from "#lib/changes/index.ts"
import type { Flag, FlagValue } from "#lib/definition/index.ts"
import type { Identity, Anonymous } from "#lib/identity/index.ts"
import type { DecisionStore } from "#lib/sharing/index.ts"
import { type Decision, decision } from "#lib/definition/decision.ts"
import { defineProvider, type Provider } from "#lib/provider/index.ts"

type FakeEntry<TFlag extends Flag> = readonly [
  flag: TFlag,
  value: FlagValue<TFlag>,
  payload?: unknown,
]

/**
 * A provider for tests. It answers with the values you set, and leaves out a flag without a value,
 * so that flag returns its default with an `InvalidDecisionError`.
 */
export type FakeProvider = Provider<Identity | Anonymous> & {
  /**
   * Sets a flag's value and notifies the reader's change listeners.
   */
  set<TFlag extends Flag>(flag: TFlag, value: FlagValue<TFlag>, payload?: unknown): void
}

// The value's own type picks the decision, so a value of the wrong type for its flag reaches the
// reader as a mismatched decision, which validation rejects.
function toDecision(value: boolean | string, payload: unknown): Decision {
  return typeof value === "boolean" ? decision.boolean(value) : decision.variant(value, payload)
}

/**
 * Creates a provider that answers with fixed values.
 *
 * @example
 *   const flags = createFlags({
 *     provider: fakeProvider([
 *       [theme, "dark"],
 *       [betaAccess, true],
 *     ]),
 *     identify: () => ({ distinctId: "test-user" }),
 *   })
 */
export function fakeProvider<const TFlags extends readonly Flag[]>(entries?: {
  readonly [K in keyof TFlags]: FakeEntry<TFlags[K]>
}): FakeProvider {
  const decisions = new Map<string, Decision>()
  // TypeScript does not iterate a mapped tuple type, so read the entries as their common shape.
  const initial: ReadonlyArray<FakeEntry<Flag>> = entries ?? []
  for (const [flag, value, payload] of initial) {
    decisions.set(flag.key, toDecision(value, payload))
  }
  const listeners = new Set<ChangeListener>()
  const provider = defineProvider({
    decide: (flags, _identity: Identity | Anonymous) => {
      const result: Record<string, Decision> = {}
      for (const flag of flags) {
        const decision = decisions.get(flag.key)
        if (decision) {
          result[flag.key] = decision
        }
      }
      return result
    },
    name: "fake",
    subscribe(notify) {
      listeners.add(notify)
      return () => {
        listeners.delete(notify)
      }
    },
  })
  return Object.freeze({
    ...provider,
    set(flag, value, payload) {
      decisions.set(flag.key, toDecision(value, payload))
      for (const notify of listeners) {
        notify([flag.key])
      }
    },
  })
}

/**
 * A `DecisionStore` that keeps decisions in memory.
 */
export function memoryStore(): DecisionStore {
  const decisions = new Map<string, Decision>()
  return {
    delete: (key) => Promise.resolve(decisions.delete(key)),
    get: (key) => Promise.resolve(decisions.get(key)),
    set(key, decision) {
      decisions.set(key, decision)
      return Promise.resolve()
    },
  }
}
