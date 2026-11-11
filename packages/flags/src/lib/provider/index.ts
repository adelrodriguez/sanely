import type { ChangeListener } from "#lib/changes/index.ts"
import type { Decision } from "#lib/definition/decision.ts"
import type { Flag } from "#lib/definition/index.ts"
import type { Identity, Subject } from "#lib/identity/index.ts"
import type { MaybePromise } from "#lib/shared/utils.ts"
import {
  FlagDefinitionError,
  InvalidDecisionError,
  ProviderFailedError,
} from "#lib/errors/index.ts"

export type DecideOptions = {
  /**
   * Aborts when every evaluation that waits for this call has timed out or been cancelled.
   */
  readonly signal: AbortSignal
}

type ProviderBase = {
  /**
   * Names the provider in `ProviderFailedError`.
   */
  name: string
  /**
   * Attaches to the provider's flag changes and returns a detach function.
   */
  subscribe?: (notify: ChangeListener) => () => void
}

type DecideOne<TIdentity extends Subject> = {
  /**
   * Decides one flag. The package calls it once for each flag in a batch.
   */
  decideOne: (flag: Flag, identity: TIdentity, options: DecideOptions) => MaybePromise<Decision>
  decide?: never
}

type DecideMany<TIdentity extends Subject> = {
  /**
   * Decides several flags in one call and returns a record from flag key to decision. A missing key
   * makes that flag return its default with an `InvalidDecisionError`.
   */
  decide: (
    flags: readonly Flag[],
    identity: TIdentity,
    options: DecideOptions
  ) => MaybePromise<Readonly<Record<string, Decision>>>
  decideOne?: never
}

/**
 * What `defineProvider` takes: a name, exactly one of `decide` and `decideOne`, and an optional
 * `subscribe`.
 */
export type ProviderDefinition<TIdentity extends Subject = Identity> = ProviderBase
  & (DecideMany<TIdentity> | DecideOne<TIdentity>)

/**
 * A provider built with `defineProvider`. `TIdentity` is the identity that it evaluates for.
 */
export type Provider<TIdentity extends Subject = Identity> = Readonly<ProviderDefinition<TIdentity>>

/**
 * Builds a provider. The identity type comes from the annotation on the `identity` parameter of
 * `decide` or `decideOne`. Without an annotation, it is `Identity`.
 *
 * @example
 *   export function launchDarkly(client: LDClient) {
 *     return defineProvider({
 *       name: "launchdarkly",
 *       decideOne: async (flag, identity: LDIdentity) =>
 *         decision.boolean(await client.boolVariation(flag.key, toContext(identity), false)),
 *     })
 *   }
 */
export function defineProvider<TIdentity extends Subject = Identity>(
  definition: ProviderDefinition<TIdentity>
): Provider<TIdentity> {
  assertProvider(definition)
  return Object.freeze({ ...definition })
}

export function assertProvider(provider: unknown): void {
  if (typeof provider !== "object" || provider === null) {
    throw new FlagDefinitionError("provider must be an object")
  }
  const name: unknown = Reflect.get(provider, "name")
  if (typeof name !== "string" || name.length === 0) {
    throw new FlagDefinitionError("provider name must be a non-empty string")
  }
  const decide: unknown = Reflect.get(provider, "decide")
  const decideOne: unknown = Reflect.get(provider, "decideOne")
  if ((decide === undefined) === (decideOne === undefined)) {
    throw new FlagDefinitionError("provider needs exactly one of decide and decideOne")
  }
  if (decide !== undefined && typeof decide !== "function") {
    throw new FlagDefinitionError("provider decide must be a function")
  }
  if (decideOne !== undefined && typeof decideOne !== "function") {
    throw new FlagDefinitionError("provider decideOne must be a function")
  }
  const subscribe: unknown = Reflect.get(provider, "subscribe")
  if (subscribe !== undefined && typeof subscribe !== "function") {
    throw new FlagDefinitionError("provider subscribe must be a function")
  }
}

/**
 * The evaluation engine's view of a provider. `decideOne` decides one flag through either provider
 * method. `decideMany` is present only for a provider with a bulk `decide`. Both turn a provider
 * failure into `ProviderFailedError` and leave validation to the caller.
 */
export type ProviderCalls<TIdentity extends Subject> = {
  name: string
  decideOne: (flag: Flag, identity: TIdentity, options: DecideOptions) => Promise<unknown>
  decideMany?: (
    flags: readonly Flag[],
    identity: TIdentity,
    options: DecideOptions
  ) => Promise<unknown>
  subscribe?: (notify: ChangeListener) => () => void
}

async function callProvider<T>(name: string, call: () => MaybePromise<T>): Promise<T> {
  try {
    return await call()
  } catch (error) {
    throw new ProviderFailedError({ cause: error, provider: name })
  }
}

/**
 * Reads one flag's decision from a bulk result. A missing key is an invalid decision.
 */
export function pickDecision(decisions: unknown, flag: Flag): unknown {
  if (typeof decisions !== "object" || decisions === null || !Object.hasOwn(decisions, flag.key)) {
    throw new InvalidDecisionError({
      decision: undefined,
      problem: "missing",
      reason: "the provider returned no decision for this flag",
    })
  }
  return Reflect.get(decisions, flag.key)
}

export function providerCalls<TIdentity extends Subject>(
  provider: Provider<TIdentity>
): ProviderCalls<TIdentity> {
  const { name, subscribe } = provider
  if (provider.decideOne) {
    const { decideOne } = provider
    return {
      decideOne: (flag, identity, options) =>
        callProvider(name, () => decideOne(flag, identity, options)),
      name,
      subscribe,
    }
  }
  const { decide } = provider
  const decideMany = (
    flags: readonly Flag[],
    identity: TIdentity,
    options: DecideOptions
  ): Promise<unknown> => callProvider(name, () => decide(flags, identity, options))
  return {
    decideMany,
    decideOne: async (flag, identity, options) =>
      pickDecision(await decideMany([flag], identity, options), flag),
    name,
    subscribe,
  }
}
