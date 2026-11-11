import type { ChangeBroadcaster } from "#lib/changes/index.ts"
import type { Decision } from "#lib/definition/decision.ts"
import type { Subject } from "#lib/identity/index.ts"
import type { MaybePromise } from "#lib/shared/utils.ts"
import type { KeyFields } from "./evaluation-key"
import { createResolutionState, type ResolutionState } from "./resolution-state"

/**
 * A store for decisions. The store owns serialization and expiry.
 *
 * Variant payloads can contain values that are not JSON-safe. A persistent store must preserve them
 * or normalize them for the provider.
 */
export type DecisionStore = {
  /**
   * Deletes one stored decision: one that no longer fits its flag, or one that a fresh read
   * replaces.
   */
  delete?(key: string): Promise<unknown>
  /**
   * Deletes every stored decision of these flag keys, or of every flag without keys, including the
   * decisions that other processes stored. A change notification calls it. Without it, a store
   * keeps its decisions after a change until it expires them.
   */
  deleteFlags?(flagKeys?: readonly string[]): Promise<unknown>
  get(key: string): Promise<Decision | null | undefined>
  /**
   * Stores a decision. `entry.flagKey` names its flag, so a store with `deleteFlags` can find it.
   */
  set(key: string, decision: Decision, entry: { readonly flagKey: string }): Promise<void>
}

/**
 * A store operation failed. The evaluation continued without the store. `operation` tells an
 * operation on one entry from `deleteFlags`, which has no entry.
 */
export type StoreFailedReport<TIdentity extends Subject = Subject> =
  | {
      readonly _tag: "StoreFailed"
      readonly error: Error
      readonly flagKey: string
      readonly identity: TIdentity | null
      /**
       * The evaluation key, or the flag key when the `key` function failed.
       */
      readonly key: string
      readonly operation: "delete" | "get" | "key" | "set" | "validate"
    }
  | {
      readonly _tag: "StoreFailed"
      readonly error: Error
      /**
       * The changed flag keys, or `undefined` when the notification named none.
       */
      readonly flagKeys: readonly string[] | undefined
      readonly operation: "deleteFlags"
    }

/**
 * The provider's `subscribe` threw. Evaluations continue without live invalidation, and the next
 * evaluation or listener tries again.
 */
export type SubscribeFailedReport = {
  readonly _tag: "SubscribeFailed"
  readonly error: Error
}

export type CacheOptions<TIdentity extends Subject> = {
  /**
   * Concurrent evaluations with one evaluation key share one provider call. Defaults to `true`. Set
   * `false` when the provider has side effects for each call, such as exposure logging.
   */
  coalesce?: boolean
  /**
   * Returns the identity fields, beyond `distinctId`, that change the decision, such as a plan or a
   * tenant. The package adds them to the evaluation key, which the store and coalescing use to
   * identify interchangeable evaluations. It keeps the provider, the flag, and `distinctId` in the
   * key, so two flags never share a decision.
   */
  key?: KeyFields<TIdentity>
  store?: DecisionStore
}

/**
 * One reader's decision memory and the options that control it.
 */
export type Sharing<TIdentity extends Subject> = {
  changes: ChangeBroadcaster | undefined
  coalesce: boolean
  key: KeyFields<TIdentity> | undefined
  onError:
    | ((report: StoreFailedReport<TIdentity> | SubscribeFailedReport) => MaybePromise<void>)
    | undefined
  // The provider's name, which the default evaluation key holds.
  provider: string
  state: ResolutionState
  store: DecisionStore | undefined
}

export function createSharing<TIdentity extends Subject>(
  options: CacheOptions<TIdentity> | undefined,
  provider: string,
  changes: ChangeBroadcaster | undefined,
  onError: Sharing<TIdentity>["onError"]
): Sharing<TIdentity> {
  return {
    changes,
    coalesce: options?.coalesce !== false,
    key: options?.key,
    onError,
    provider,
    state: createResolutionState(),
    store: options?.store,
  }
}
