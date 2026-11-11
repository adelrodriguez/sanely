import { byKind } from "#lib/definition/index.ts"
import { anonymous, type EvaluationContext, type Subject } from "#lib/identity/index.ts"
import { type FlagCacheKey, serializeKey } from "#lib/shared/cache-key.ts"

/**
 * The evaluation key of one evaluation, or `undefined` when the evaluation must not share a
 * decision: before the identity resolves, and for `anonymous`. The key holds the provider name, the
 * flag key, the flag shape, and the type and value of `identity.distinctId`, so readers with
 * different providers can share one store. A consumer `key` function adds the identity fields that
 * also change the decision. It cannot remove the others, so two flags never share a decision.
 */
export function getEvaluationKey<TIdentity extends Subject>(
  context: EvaluationContext<TIdentity>,
  provider: string,
  key?: (context: EvaluationContext<TIdentity>) => readonly FlagCacheKey[]
): string | undefined {
  const { flag, identity } = context
  if (identity === null || identity === anonymous) {
    return undefined
  }
  const { distinctId } = identity
  // The JSON array closes itself, so the serialized parts after it cannot run into it.
  const parts = key ? serializeKey(key(context), "cacheKey") : ""
  return `${JSON.stringify([
    provider,
    flag.key,
    flag.kind,
    byKind(flag, { boolean: () => null, variant: ({ variants }) => variants }),
    typeof distinctId,
    String(distinctId),
  ])}${parts}`
}
