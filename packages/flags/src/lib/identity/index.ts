import type { Flag } from "#lib/definition/index.ts"
import type { MaybePromise } from "#lib/shared/utils.ts"
import { IdentityNotFoundError } from "#lib/errors/index.ts"

/**
 * A supported identity attribute value.
 */
export type IdentityValue = bigint | boolean | number | object | string | symbol | null | undefined

/**
 * The subject of an evaluation. A provider's identity type extends it.
 */
export type Identity = {
  /**
   * A unique identifier for the subject.
   */
  distinctId: string | number
} & Record<string, IdentityValue>

/**
 * Returned by `identify` to evaluate without an identity. A provider accepts it only when its
 * `identity` parameter includes `typeof anonymous`. The package never caches or coalesces an
 * anonymous evaluation.
 */
export const anonymous: unique symbol = Symbol("@sanely/flags/anonymous")

export type Anonymous = typeof anonymous

/**
 * What a provider can evaluate for: an identity, or `anonymous` when the provider allows it.
 */
export type Subject = Identity | Anonymous

/**
 * What one evaluation is about. Hooks and the cache `key` function receive it. `identity` is `null`
 * until the identity resolves, and stays `null` when it fails to resolve.
 */
export type EvaluationContext<TIdentity extends Subject = Subject> = {
  readonly flag: Flag
  readonly identity: TIdentity | null
  readonly signal: AbortSignal
}

/**
 * Resolves the identity of one evaluation or batch.
 */
export type IdentitySource<TIdentity extends Subject> = () => Promise<TIdentity>

export function identifyWith<TIdentity extends Subject>(
  identify: () => MaybePromise<TIdentity | null | undefined>
): IdentitySource<TIdentity> {
  return async () => {
    let identity: TIdentity | null | undefined
    try {
      identity = await identify()
    } catch (error) {
      throw new IdentityNotFoundError({ cause: error })
    }
    if (identity === null || identity === undefined) {
      throw new IdentityNotFoundError()
    }
    return identity
  }
}

export function identifyAs<TIdentity extends Subject>(
  identity: TIdentity | null | undefined
): IdentitySource<TIdentity> {
  return () =>
    identity === null || identity === undefined
      ? Promise.reject(new IdentityNotFoundError())
      : Promise.resolve(identity)
}

/**
 * The `distinctId` of a subject, or `null` for `anonymous`.
 */
export function distinctIdOf(identity: Subject): string | number | null {
  return identity === anonymous ? null : identity.distinctId
}
