import type { EvaluationDetails } from "./decision"
import type { Identity } from "./identity"

export type FlagCallOptions<TIdentity extends Identity | null> = {
  identity?: TIdentity
  signal?: AbortSignal
}

type RequiredFlagCallOptions<TIdentity extends Identity> = Omit<
  FlagCallOptions<TIdentity>,
  "identity"
> & {
  identity: TIdentity
}

type FlagCallArguments<
  TCallIdentity extends Identity | null,
  TCallRequired extends boolean,
> = TCallRequired extends true
  ? [options: RequiredFlagCallOptions<Extract<TCallIdentity, Identity>>]
  : [options?: FlagCallOptions<TCallIdentity>]

declare const flagIdentity: unique symbol

// Invariant in every factory type argument, so a flag is assignable only where its factory's
// identity type and call mode match exactly.
type FlagIdentityMarker<
  TIdentity extends Identity,
  TCallIdentity extends TIdentity | null,
  TCallRequired extends boolean,
> = (marker: [TIdentity, TCallIdentity, TCallRequired]) => [TIdentity, TCallIdentity, TCallRequired]

type FlagEvaluatorShape<
  TValue extends boolean | string,
  TCallIdentity extends Identity | null,
  TPayload,
  TCallRequired extends boolean,
> = ((...args: FlagCallArguments<TCallIdentity, TCallRequired>) => Promise<TValue>) & {
  details: (
    ...args: FlagCallArguments<TCallIdentity, TCallRequired>
  ) => Promise<EvaluationDetails<TValue, TPayload>>
}

export type FlagEvaluator<
  TIdentity extends Identity,
  TValue extends boolean | string,
  TCallIdentity extends TIdentity | null = TIdentity,
  TPayload = unknown,
  TCallRequired extends boolean = false,
> = FlagEvaluatorShape<TValue, TCallIdentity, TPayload, TCallRequired> & {
  /**
   * Type-only. Evaluators do not have this property at runtime.
   */
  readonly [flagIdentity]: FlagIdentityMarker<TIdentity, TCallIdentity, TCallRequired>
}

/**
 * Any evaluator, whatever its identity type and call mode.
 */
export type AnyFlagEvaluator =
  | FlagEvaluatorShape<boolean | string, never, unknown, false>
  | FlagEvaluatorShape<boolean | string, never, unknown, true>

export type FlagOptions<T extends string[]> = {
  key: string
  defaultValue: boolean | T[number]
  variants?: T
  timeoutMs?: number
}

export type FlagConfiguration =
  | { kind: "boolean" }
  | { kind: "variant"; variants: readonly string[] }
