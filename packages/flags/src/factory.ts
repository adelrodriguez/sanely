import type {
  AnyFlagEvaluator,
  AnonymousFlagFactoryConfig,
  CallerIdentityFlagFactoryConfig,
  EvaluationDetails,
  FlagCallOptions,
  FlagChanges,
  FlagEvaluator,
  FlagFactoryConfig,
  Identity,
} from "#lib/types/index.ts"
import { resolveConfig } from "#lib/config/resolved-config.ts"
import { type BatchEntry, executeFlagBatch } from "#lib/evaluation/batch.ts"
import { executeFlag, executeFlagDetails } from "#lib/evaluation/engine.ts"
import { assertFlagOptions, assertTimeoutMs } from "#lib/flag/configuration.ts"
import {
  type EvaluatorFactoryRef,
  getEvaluatorRecord,
  registerEvaluator,
} from "#lib/flag/registry.ts"
import { ForeignFlagEvaluatorError, BatchFlagNotFoundError } from "#lib/shared/errors.ts"
import { reportInBackground } from "#lib/shared/report.ts"
import { normalizeError } from "#lib/shared/utils.ts"

type FlagValue<TEvaluator> =
  TEvaluator extends FlagEvaluator<
    infer _TIdentity,
    infer TValue,
    infer _TCallIdentity,
    infer _TPayload,
    infer _TRequired
  >
    ? TValue
    : never
type FlagPayload<TEvaluator> =
  TEvaluator extends FlagEvaluator<
    infer _TIdentity,
    boolean | string,
    infer _TCallIdentity,
    infer TPayload,
    infer _TRequired
  >
    ? TPayload
    : never
type FlagDetails<TEvaluator> = EvaluationDetails<FlagValue<TEvaluator>, FlagPayload<TEvaluator>>
type FactoryFlagEvaluator<
  TIdentity extends Identity,
  TCallIdentity extends TIdentity | null,
  TCallRequired extends boolean,
> = FlagEvaluator<TIdentity, boolean | string, TCallIdentity, unknown, TCallRequired>

export type FlagBatch<TFlags extends readonly AnyFlagEvaluator[]> = Readonly<{
  [K in keyof TFlags]: FlagValue<TFlags[K]>
}> & {
  details<TFlag extends TFlags[number]>(flag: TFlag): FlagDetails<TFlag>
  get<TFlag extends TFlags[number]>(flag: TFlag): FlagValue<TFlag>
}

export interface FlagFactory<
  TIdentity extends Identity,
  TCallIdentity extends TIdentity | null = TIdentity,
  TCallRequired extends boolean = false,
> {
  readonly changes: FlagChanges
  (options: {
    key: string
    defaultValue: boolean
    timeoutMs?: number
  }): FlagEvaluator<TIdentity, boolean, TCallIdentity, unknown, TCallRequired>
  <TPayload = unknown, const T extends string[] = string[]>(options: {
    key: string
    defaultValue: T[number]
    variants: T
    timeoutMs?: number
  }): FlagEvaluator<TIdentity, T[number], TCallIdentity, TPayload, TCallRequired>
  /**
   * Evaluates several flags from this factory with one identity resolution.
   *
   * TypeScript rejects flags whose identity type or call mode (anonymous, caller identity, or
   * identify) does not match this factory exactly. Flags from a different factory with the same
   * identity type and call mode pass the type check, and the call throws
   * `ForeignFlagEvaluatorError` at runtime.
   */
  batch<
    const TFlags extends ReadonlyArray<
      FactoryFlagEvaluator<TIdentity, TCallIdentity, TCallRequired>
    >,
  >(
    flags: TFlags,
    ...args: TCallRequired extends true
      ? [options: FlagCallOptions<TCallIdentity> & { identity: Extract<TCallIdentity, Identity> }]
      : [options?: FlagCallOptions<TCallIdentity>]
  ): Promise<FlagBatch<TFlags>>
}

/**
 * Creates a flag factory. The flag factory creates evaluators that evaluate feature flags for an
 * identity.
 *
 * @example
 *   const flag = createFlags({
 *     identify: async () => ({ distinctId: getCurrentUserId() }),
 *     decide: async (key, identity) => yourProvider.evaluate(key, identity),
 *   })
 *
 *   const betaAccess = flag({ key: "beta-access", defaultValue: false })
 *
 *   await betaAccess()
 *   await betaAccess({ identity: { distinctId: "test-user" } }) // Evaluate for a specific identity
 *
 *   const theme = flag({
 *     key: "theme",
 *     defaultValue: "light",
 *     variants: ["light", "dark", "system"],
 *   })
 *
 *   const result = await theme() // "light" | "dark" | "system"
 */
export function createFlags<TIdentity extends Identity>(
  config: FlagFactoryConfig<TIdentity>
): FlagFactory<TIdentity>
export function createFlags<TIdentity extends Identity>(
  config: AnonymousFlagFactoryConfig<TIdentity>
): FlagFactory<TIdentity, TIdentity | null>
export function createFlags<TIdentity extends Identity>(
  config: CallerIdentityFlagFactoryConfig<TIdentity>
): FlagFactory<TIdentity, TIdentity, true>
export function createFlags<TIdentity extends Identity>(
  config:
    | FlagFactoryConfig<TIdentity>
    | AnonymousFlagFactoryConfig<TIdentity>
    | CallerIdentityFlagFactoryConfig<TIdentity>
): FlagFactory<TIdentity, TIdentity | null> | FlagFactory<TIdentity, TIdentity, true> {
  assertTimeoutMs(config.timeoutMs)
  const resolved = resolveConfig(config)
  const changes: FlagChanges = {
    subscribe(listener) {
      return (
        resolved.changes?.subscribe((keys) => {
          reportInBackground(listener, keys)
        }) ?? (() => null)
      )
    },
  }

  async function batch(
    flags: readonly AnyFlagEvaluator[],
    callOptions?: FlagCallOptions<TIdentity | null>
  ): Promise<FlagBatch<readonly AnyFlagEvaluator[]>> {
    const entries: BatchEntry[] = flags.map((flag) => {
      const record = getEvaluatorRecord(flag)
      if (!record || record.factoryRef !== factoryRef) {
        throw new ForeignFlagEvaluatorError()
      }
      return { flag, options: record.options }
    })
    const results = await executeFlagBatch(resolved, entries, callOptions)
    const getDetails = <TFlag extends AnyFlagEvaluator>(flag: TFlag): FlagDetails<TFlag> => {
      const details = results.get(flag)
      if (!details) {
        throw new BatchFlagNotFoundError()
      }
      return details as FlagDetails<TFlag>
    }
    const values = flags.map((flag) => getDetails(flag).value)
    return Object.assign(values, {
      details: getDetails,
      get<TFlag extends AnyFlagEvaluator>(flag: TFlag): FlagValue<TFlag> {
        return getDetails(flag).value
      },
    })
  }

  const factoryRef: EvaluatorFactoryRef = {
    batch: batch as EvaluatorFactoryRef["batch"],
    changes,
    reportSubscribeError(flagKey, error) {
      reportInBackground(resolved.onCacheError, {
        error: normalizeError(error),
        flagKey,
        identity: null,
        key: flagKey,
        operation: "subscribe",
      })
    },
  }

  function flag(options: {
    key: string
    defaultValue: boolean
    timeoutMs?: number
  }): FlagEvaluator<TIdentity, boolean, TIdentity | null>
  function flag<TPayload = unknown, const T extends string[] = string[]>(options: {
    key: string
    defaultValue: T[number]
    variants: T
    timeoutMs?: number
  }): FlagEvaluator<TIdentity, T[number], TIdentity | null, TPayload>
  function flag<TPayload = unknown, const T extends string[] = string[]>(options: {
    key: string
    defaultValue: boolean | T[number]
    variants?: T
    timeoutMs?: number
  }): FlagEvaluator<TIdentity, boolean | T[number], TIdentity | null, TPayload> {
    assertFlagOptions(options)
    assertTimeoutMs(options.timeoutMs)

    // Read on each call, as the batch does for its entries.
    const deadline = () => ({ timeoutMs: options.timeoutMs ?? resolved.timeoutMs })
    const evaluator = async (callOptions?: FlagCallOptions<TIdentity | null>) =>
      executeFlag(resolved, options, callOptions, resolved, deadline())

    const assigned = Object.assign(evaluator, {
      details: (callOptions?: FlagCallOptions<TIdentity | null>) =>
        executeFlagDetails<TIdentity, T, TPayload>(
          resolved,
          options,
          callOptions,
          resolved,
          deadline()
        ),
    })
    registerEvaluator(assigned, { factoryRef, options })
    // The identity marker is type-only, so the runtime evaluator never has it.
    return assigned as FlagEvaluator<TIdentity, boolean | T[number], TIdentity | null, TPayload>
  }

  return Object.assign(flag, {
    batch: batch as <const TFlags extends readonly AnyFlagEvaluator[]>(
      flags: TFlags,
      callOptions?: FlagCallOptions<TIdentity | null>
    ) => Promise<FlagBatch<TFlags>>,
    changes,
  })
}
