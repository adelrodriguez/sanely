import type { ValidateTimeExpression } from "@sanely/duration"
import type { DecisionSource } from "#lib/definition/decision.ts"
import type { Hook, HookFailedReport } from "#lib/evaluation/hooks.ts"
import { type ChangeListener, createChangeBroadcaster } from "#lib/changes/index.ts"
import { type Flag, type FlagValue, type FlagValues, parseTimeout } from "#lib/definition/index.ts"
import { type EvaluationError, FlagDefinitionError } from "#lib/errors/index.ts"
import { evaluateMany } from "#lib/evaluation/batch.ts"
import { evaluate, type EvaluationDetails, type Evaluator } from "#lib/evaluation/engine.ts"
import {
  distinctIdOf,
  identifyAs,
  identifyWith,
  type IdentitySource,
  type Subject,
} from "#lib/identity/index.ts"
import { assertProvider, type Provider, providerCalls } from "#lib/provider/index.ts"
import { reportInBackground } from "#lib/shared/report.ts"
import { normalizeError, type MaybePromise } from "#lib/shared/utils.ts"
import {
  createSharing,
  type CacheOptions,
  type StoreFailedReport,
  type SubscribeFailedReport,
} from "#lib/sharing/index.ts"

/**
 * A failure outside an evaluation's result: a hook, a store operation, or the provider's
 * `subscribe`.
 */
export type ErrorReport<TIdentity extends Subject = Subject> =
  | HookFailedReport<TIdentity>
  | StoreFailedReport<TIdentity>
  | SubscribeFailedReport

export type ReadOptions = {
  signal?: AbortSignal
}

/**
 * One flag's entry in a snapshot.
 */
export type FlagSnapshotEntry = {
  readonly kind: Flag["kind"]
  readonly value: boolean | string
  readonly source: DecisionSource | "default"
  /**
   * The tag of the error when the evaluation fell back to the default.
   */
  readonly error?: EvaluationError["_tag"]
}

/**
 * Serializable flag values that a server evaluated for one identity, so a client can render the
 * same values first.
 */
export type FlagSnapshot = {
  /**
   * The `distinctId` of the identity that the snapshot was made for, or `null` for `anonymous` and
   * for an identity that failed to resolve.
   */
  readonly distinctId: string | number | null
  readonly flags: Readonly<Record<string, FlagSnapshotEntry>>
}

/**
 * Reads flags for one identity. Reads never reject: a failed evaluation returns the flag's default.
 */
export type FlagReader = {
  get<TFlag extends Flag>(flag: TFlag, options?: ReadOptions): Promise<FlagValue<TFlag>>
  details<TFlag extends Flag>(flag: TFlag, options?: ReadOptions): Promise<EvaluationDetails<TFlag>>
  /**
   * Evaluates several flags with one identity resolution and returns their values in order.
   */
  getMany<const TFlags extends readonly Flag[]>(
    flags: TFlags,
    options?: ReadOptions
  ): Promise<FlagValues<TFlags>>
  detailsMany<const TFlags extends readonly Flag[]>(
    flags: TFlags,
    options?: ReadOptions
  ): Promise<{ -readonly [K in keyof TFlags]: EvaluationDetails<TFlags[K]> }>
  snapshot(flags: readonly Flag[], options?: ReadOptions): Promise<FlagSnapshot>
}

type FlagScope<TIdentity extends Subject> = {
  /**
   * A reader for one identity.
   */
  for(identity: TIdentity): FlagReader
  /**
   * Listens for the provider's flag changes and returns an unsubscribe function. No keys means that
   * any flag may have changed.
   */
  subscribe(listener: ChangeListener): () => void
}

/**
 * The reader that `createFlags` returns when it has `identify`.
 */
export type Flags<TIdentity extends Subject> = FlagReader & FlagScope<TIdentity>

/**
 * The reader that `createFlags` returns without `identify`. Every read names its identity through
 * `for`.
 */
export type CallerFlags<TIdentity extends Subject> = FlagScope<TIdentity>

export type FlagsOptions<TIdentity extends Subject, T extends string = never> = {
  provider: Provider<TIdentity>
  /**
   * The default deadline for each evaluation, in milliseconds or as a time expression such as
   * `"1s"`. A flag's own `timeout` replaces it.
   */
  timeout?: number | ValidateTimeExpression<T>
  cache?: CacheOptions<NoInfer<TIdentity>>
  hooks?: ReadonlyArray<Hook<NoInfer<TIdentity>>>
  onError?: (report: ErrorReport<NoInfer<TIdentity>>) => MaybePromise<void>
}

function createReader<TIdentity extends Subject>(
  evaluator: Evaluator<TIdentity>,
  identify: IdentitySource<TIdentity>
): FlagReader {
  const decide = evaluator.provider.decideOne
  const reader: FlagReader = {
    details: (flag, options) =>
      evaluate(evaluator, flag, identify, decide, { signal: options?.signal }),
    detailsMany: (flags, options) => evaluateMany(evaluator, flags, identify, options?.signal),
    async get(flag, options) {
      const result = await reader.details(flag, options)
      return result.value
    },
    async getMany(flags, options) {
      const results = await reader.detailsMany(flags, options)
      // `map` loses the tuple type. Each value comes from the details at the same position.
      return results.map((result) => result.value) as FlagValues<typeof flags>
    },
    async snapshot(flags, options) {
      let distinctId: string | number | null = null
      // The batch resolves the identity once, under its deadline and the caller's signal.
      const identifyOnce: IdentitySource<TIdentity> = async () => {
        const identity = await identify()
        distinctId = distinctIdOf(identity)
        return identity
      }
      const results = await evaluateMany(evaluator, flags, identifyOnce, options?.signal)
      const entries: Record<string, FlagSnapshotEntry> = {}
      flags.forEach((flag, index) => {
        const result = results[index]
        if (!result) return
        entries[flag.key] =
          result.source === "default"
            ? { error: result.error._tag, kind: flag.kind, source: "default", value: result.value }
            : { kind: flag.kind, source: result.source, value: result.value }
      })
      return { distinctId, flags: entries }
    },
  }
  return reader
}

/**
 * Creates a reader that evaluates flags with one provider. With `identify`, the reader can read
 * directly. Without it, every read goes through `for(identity)`.
 *
 * @example
 *   const flags = createFlags({ provider: launchDarkly(client), identify: getCurrentUser })
 *
 *   const theme = await flags.get(themeFlag)
 *   const [beta, look] = await flags.getMany([betaAccess, themeFlag])
 */
export function createFlags<TIdentity extends Subject, const T extends string = never>(
  options: FlagsOptions<TIdentity, T> & {
    identify: () => MaybePromise<NoInfer<TIdentity> | null | undefined>
  }
): Flags<TIdentity>
export function createFlags<TIdentity extends Subject, const T extends string = never>(
  options: FlagsOptions<TIdentity, T> & { identify?: undefined }
): CallerFlags<TIdentity>
export function createFlags<TIdentity extends Subject, const T extends string = never>(
  options: FlagsOptions<TIdentity, T> & {
    identify?: () => MaybePromise<TIdentity | null | undefined>
  }
): Flags<TIdentity> | CallerFlags<TIdentity> {
  assertProvider(options.provider)
  const timeout = parseTimeout(options.timeout)
  if (options.identify !== undefined && typeof options.identify !== "function") {
    throw new FlagDefinitionError("identify must be a function")
  }

  const provider = providerCalls(options.provider)
  const { onError } = options
  const changes =
    provider.subscribe
    && createChangeBroadcaster(provider.subscribe, (error) => {
      reportInBackground(onError, { _tag: "SubscribeFailed", error: normalizeError(error) })
    })
  const evaluator: Evaluator<TIdentity> = {
    hooks: [...(options.hooks ?? [])],
    onError,
    provider,
    sharing: createSharing(options.cache, changes, onError),
    timeout,
  }

  const scope: FlagScope<TIdentity> = {
    for: (identity) => createReader(evaluator, identifyAs(identity)),
    subscribe(listener) {
      if (!changes) {
        return () => null
      }
      return changes.subscribe((keys) => {
        reportInBackground(listener, keys)
      })
    },
  }

  return options.identify
    ? { ...createReader(evaluator, identifyWith(options.identify)), ...scope }
    : scope
}
