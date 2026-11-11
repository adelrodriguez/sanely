import { anonymous, type EvaluationContext, type Subject } from "#lib/identity/index.ts"

/**
 * The evaluation key of one evaluation, or `undefined` when the evaluation must not share a
 * decision: before the identity resolves, and for `anonymous`. The default key uses the provider
 * name, the flag key, the flag shape, and the type and value of `identity.distinctId`, so readers
 * with different providers can share one store.
 */
export function getEvaluationKey<TIdentity extends Subject>(
  context: EvaluationContext<TIdentity>,
  provider: string,
  key?: (context: EvaluationContext<TIdentity>) => string
): string | undefined {
  const { flag, identity } = context
  if (identity === null || identity === anonymous) {
    return undefined
  }
  if (key) {
    return key(context)
  }
  const { distinctId } = identity
  return JSON.stringify([
    provider,
    flag.key,
    flag.kind,
    flag.kind === "variant" ? flag.variants : undefined,
    typeof distinctId,
    String(distinctId),
  ])
}
