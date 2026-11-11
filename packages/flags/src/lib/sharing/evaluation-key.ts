import { byKind } from "#lib/definition/index.ts"
import {
  anonymous,
  type EvaluationContext,
  type Identity,
  type Subject,
} from "#lib/identity/index.ts"
import { type FlagCacheKey, serializeKey } from "#lib/shared/cache-key.ts"

/**
 * A consumer `key` function: the identity fields, beyond `distinctId`, that change a decision.
 */
export type KeyFields<TIdentity extends Subject> = (
  context: EvaluationContext<TIdentity>
) => readonly FlagCacheKey[]

/**
 * The part of an evaluation key that identifies the identity: the type and value of `distinctId`,
 * and the serialized output of the consumer `key` function, or `""` without one. It reads no other
 * identity field, so it accepts every identity that `Identity` allows.
 */
export type IdentityKey = {
  readonly distinctId: readonly [type: string, value: string]
  readonly fields: string
}

/**
 * The type and value of an identity's `distinctId`, so a numeric and a string `distinctId` with one
 * text stay apart.
 */
export function distinctIdKey({ distinctId }: Identity): IdentityKey["distinctId"] {
  return [typeof distinctId, String(distinctId)]
}

/**
 * The identity part of one evaluation's key, or `undefined` when the evaluation must not share a
 * decision: before the identity resolves, and for `anonymous`. The store, request coalescing, and
 * the React flag cache all identify an identity this way. It throws when the `key` function throws
 * or returns a value that is not a `FlagCacheKey`.
 */
export function getIdentityKey<TIdentity extends Subject>(
  context: EvaluationContext<TIdentity>,
  key?: KeyFields<TIdentity>
): IdentityKey | undefined {
  const { identity } = context
  if (identity === null || identity === anonymous) {
    return undefined
  }
  return {
    distinctId: distinctIdKey(identity),
    fields: key ? serializeKey(key(context), "cacheKey") : "",
  }
}

/**
 * The evaluation key of one evaluation, or `undefined` when the evaluation must not share a
 * decision. The key holds the provider name, the flag key, the flag shape, and the identity key, so
 * readers with different providers can share one store. A consumer `key` function adds the identity
 * fields that also change the decision. It cannot remove the others, so two flags never share a
 * decision.
 */
export function getEvaluationKey<TIdentity extends Subject>(
  context: EvaluationContext<TIdentity>,
  provider: string,
  key?: KeyFields<TIdentity>
): string | undefined {
  const identityKey = getIdentityKey(context, key)
  if (identityKey === undefined) {
    return undefined
  }
  const { flag } = context
  // The JSON array closes itself, so the serialized fields after it cannot run into it.
  return `${JSON.stringify([
    provider,
    flag.key,
    flag.kind,
    byKind(flag, { boolean: () => null, variant: ({ variants }) => variants }),
    ...identityKey.distinctId,
  ])}${identityKey.fields}`
}
