import type { BooleanFlag, Flag, FlagValue, VariantFlag } from "#lib/definition/index.ts"
import type { EvaluationContext, IdentitySource, Subject } from "#lib/identity/index.ts"
import type { DecideOptions, ProviderCalls } from "#lib/provider/index.ts"
import type { MaybePromise } from "#lib/shared/utils.ts"
import { type DecisionSource, extractDecisionValue } from "#lib/definition/decision.ts"
import {
  EvaluationAbortedError,
  type EvaluationError,
  EvaluationTimeoutError,
  isEvaluationError,
  ProviderFailedError,
} from "#lib/errors/index.ts"
import { createEvaluationSignal, raceWithSignal } from "#lib/shared/signals.ts"
import { resolveDecision, type Sharing } from "#lib/sharing/index.ts"
import { createHookRunner, type Hook, type HookFailedReport } from "./hooks"

type PayloadDetails<TFlag extends Flag> = TFlag extends BooleanFlag
  ? unknown
  : TFlag extends VariantFlag<string, infer TPayload>
    ? {
        /**
         * The parsed payload. Present only when a successful variant decision has one.
         */
        readonly payload?: TPayload
      }
    : never

/**
 * The result of one evaluation: the value, where it came from, and why it fell back to the default
 * when it did.
 */
export type EvaluationDetails<TFlag extends Flag = Flag> = {
  readonly flagKey: string
  readonly value: FlagValue<TFlag>
} & PayloadDetails<TFlag>
  & (
    | { readonly source: DecisionSource; readonly error?: never }
    | { readonly source: "default"; readonly error: EvaluationError }
  )

/**
 * Everything that one reader needs to evaluate a flag.
 */
export type Evaluator<TIdentity extends Subject> = {
  hooks: ReadonlyArray<Hook<TIdentity>>
  onError: ((report: HookFailedReport<TIdentity>) => MaybePromise<void>) | undefined
  provider: ProviderCalls<TIdentity>
  sharing: Sharing<TIdentity>
  timeout: number | undefined
}

/**
 * Asks for one flag's undecoded decision. A single evaluation calls the provider directly. A batch
 * joins its flush round.
 */
export type Decide<TIdentity extends Subject> = (
  flag: Flag,
  identity: TIdentity,
  options: DecideOptions
) => Promise<unknown>

/**
 * The deadline for one evaluation. With `signal`, the engine adds the flag's timeout, or the
 * reader's, to the caller's signal. `deadline` is a signal that the caller already built, such as a
 * batch entry signal that includes the caller signal and the entry timeout.
 */
export type EvaluationDeadline = { signal: AbortSignal | undefined } | { deadline: AbortSignal }

/**
 * Maps a failure to the error that the details report. The identity, provider, and decision steps
 * throw their own errors. Any other failure happens because the signal aborted.
 */
function toEvaluationError(error: unknown, signal: AbortSignal, provider: string): EvaluationError {
  if (isEvaluationError(error)) {
    return error
  }
  if (signal.aborted) {
    const reason: unknown = signal.reason
    return reason instanceof EvaluationTimeoutError ? reason : new EvaluationAbortedError(reason)
  }
  return new ProviderFailedError({ cause: error, provider })
}

export function timeoutOf<TIdentity extends Subject>(
  evaluator: Evaluator<TIdentity>,
  flag: Flag
): number | undefined {
  return flag.timeout ?? evaluator.timeout
}

export async function evaluate<TIdentity extends Subject, TFlag extends Flag>(
  evaluator: Evaluator<TIdentity>,
  flag: TFlag,
  identify: IdentitySource<TIdentity>,
  decide: Decide<TIdentity>,
  deadline: EvaluationDeadline
): Promise<EvaluationDetails<TFlag>> {
  const { cleanup, signal } =
    "deadline" in deadline
      ? createEvaluationSignal(deadline.deadline)
      : createEvaluationSignal(deadline.signal, timeoutOf(evaluator, flag))
  const state: { identity: TIdentity | null } = { identity: null }
  const context: EvaluationContext<TIdentity> = {
    flag,
    get identity() {
      return state.identity
    },
    signal,
  }
  const hooks = createHookRunner(evaluator.hooks, context, evaluator.onError)
  let details:
    | { flagKey: string; payload?: unknown; source: DecisionSource; value: boolean | string }
    | { error: EvaluationError; flagKey: string; source: "default"; value: boolean | string }
    | undefined
  let finallyDispatched = false

  try {
    const identity = await raceWithSignal(identify, signal)
    state.identity = identity

    await raceWithSignal(() => hooks.before(), signal)

    const resolution = await resolveDecision(
      evaluator.sharing,
      context,
      flag,
      (providerSignal) => decide(flag, identity, { signal: providerSignal }),
      signal
    )
    const { payload } = resolution
    const value = extractDecisionValue(resolution.decision)
    details =
      payload === undefined
        ? { flagKey: flag.key, source: resolution.source, value }
        : { flagKey: flag.key, payload, source: resolution.source, value }
    hooks.dispatchAfterThenFinally(resolution.decision, { source: resolution.source })
    finallyDispatched = true
  } catch (error) {
    const failure = toEvaluationError(error, signal, evaluator.provider.name)
    details = { error: failure, flagKey: flag.key, source: "default", value: flag.defaultValue }

    if (signal.aborted) {
      hooks.dispatchError(failure)
    } else {
      try {
        await raceWithSignal(() => hooks.error(failure), signal)
      } catch {
        // The deadline passed while the error hooks ran. They finish without blocking the result.
      }
    }
  } finally {
    if (!finallyDispatched) {
      hooks.dispatchFinally()
    }
    cleanup()
  }

  // The decision was validated against `flag`, so its value has the flag's value type.
  return details as EvaluationDetails<TFlag>
}
