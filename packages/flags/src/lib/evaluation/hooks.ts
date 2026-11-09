import type { Decision, DecisionSource } from "#lib/definition/decision.ts"
import type { EvaluationError } from "#lib/errors/index.ts"
import type { EvaluationContext, Subject } from "#lib/identity/index.ts"
import { reportInBackground } from "#lib/shared/report.ts"
import { normalizeError, type MaybePromise } from "#lib/shared/utils.ts"

/**
 * A lifecycle observer. A hook cannot change an evaluation's result, and a throwing hook is
 * reported through `onError` while the other hooks still run.
 */
export interface Hook<TIdentity extends Subject = Subject> {
  before?(context: EvaluationContext<TIdentity>): MaybePromise<void>
  after?(
    context: EvaluationContext<TIdentity>,
    decision: Decision,
    meta: { source: DecisionSource }
  ): MaybePromise<void>
  error?(context: EvaluationContext<TIdentity>, error: EvaluationError): MaybePromise<void>
  finally?(context: EvaluationContext<TIdentity>): MaybePromise<void>
}

/**
 * A hook threw or rejected.
 */
export type HookFailedReport<TIdentity extends Subject = Subject> = {
  readonly _tag: "HookFailed"
  readonly context: EvaluationContext<TIdentity>
  readonly error: Error
  readonly hookIndex: number
  readonly phase: "after" | "before" | "error" | "finally"
}

type HookErrorReporter<TIdentity extends Subject> =
  | ((report: HookFailedReport<TIdentity>) => MaybePromise<void>)
  | undefined
type HookPhase = HookFailedReport["phase"]

/**
 * Runs the hook phases of one evaluation against one hook context. No method rejects: a rejecting
 * hook is reported through `onError` and the other hooks in its phase still run. Awaitable methods
 * return a promise; detached methods return `void`, so a caller cannot await them or leak their
 * promises.
 */
export type HookRunner = {
  before(): Promise<void>
  /**
   * Runs the after phase, then the finally phase, without blocking the evaluation result.
   */
  dispatchAfterThenFinally(decision: Decision, meta: { source: DecisionSource }): void
  error(error: EvaluationError): Promise<void>
  dispatchError(error: EvaluationError): void
  dispatchFinally(): void
}

function detach(promise: Promise<void>): void {
  void promise.catch(() => null)
}

export function createHookRunner<TIdentity extends Subject>(
  hooks: ReadonlyArray<Hook<TIdentity>>,
  hookContext: EvaluationContext<TIdentity>,
  reporter: HookErrorReporter<TIdentity>
): HookRunner {
  async function runPhase(
    phase: HookPhase,
    invoke: (hook: Hook<TIdentity>) => MaybePromise<void> | undefined
  ): Promise<void> {
    const results = await Promise.allSettled(
      hooks.map((hook) => Promise.resolve().then(() => invoke(hook)))
    )
    results.forEach((result, hookIndex) => {
      if (result.status === "rejected") {
        reportInBackground(reporter, {
          _tag: "HookFailed",
          context: hookContext,
          error: normalizeError(result.reason),
          hookIndex,
          phase,
        })
      }
    })
  }

  const runError = (error: EvaluationError) =>
    runPhase("error", (hook) => hook.error?.(hookContext, error))
  const runFinally = () => runPhase("finally", (hook) => hook.finally?.(hookContext))

  return {
    before: () => runPhase("before", (hook) => hook.before?.(hookContext)),
    dispatchAfterThenFinally(decision, meta) {
      detach(
        runPhase("after", (hook) => hook.after?.(hookContext, decision, meta)).then(runFinally)
      )
    },
    dispatchError(error) {
      detach(runError(error))
    },
    dispatchFinally() {
      detach(runFinally())
    },
    error: runError,
  }
}
