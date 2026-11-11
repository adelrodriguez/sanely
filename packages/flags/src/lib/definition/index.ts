import type { ValidateTimeExpression } from "@sanely/duration"
import { FlagDefinitionError } from "#lib/errors/index.ts"
import { milliseconds } from "#lib/shared/utils.ts"

/**
 * A flag that evaluates to `true` or `false`.
 */
export type BooleanFlag = {
  readonly kind: "boolean"
  readonly key: string
  readonly defaultValue: boolean
  /**
   * The flag's deadline in milliseconds, or `undefined` to use the reader's.
   */
  readonly timeout: number | undefined
}

/**
 * A flag that evaluates to one of its string variants. `payload` parses the provider's variant
 * payload, and its return type is the payload type.
 */
export type VariantFlag<TVariant extends string = string, TPayload = unknown> = {
  readonly kind: "variant"
  readonly key: string
  readonly defaultValue: TVariant
  readonly variants: readonly TVariant[]
  readonly payload: ((payload: unknown) => TPayload) | undefined
  /**
   * The flag's deadline in milliseconds, or `undefined` to use the reader's.
   */
  readonly timeout: number | undefined
}

/**
 * Any flag definition.
 */
export type Flag = BooleanFlag | VariantFlag

// Each type below names every kind and ends in `never`, so a new kind is not silently read as
// another one.

export type FlagValue<TFlag extends Flag> = TFlag extends BooleanFlag
  ? boolean
  : TFlag extends VariantFlag<infer TVariant, infer _TPayload>
    ? TVariant
    : never

export type FlagPayload<TFlag extends Flag> = TFlag extends BooleanFlag
  ? never
  : TFlag extends VariantFlag<string, infer TPayload>
    ? TPayload
    : never

const flagKinds = { boolean: true, variant: true } satisfies Record<Flag["kind"], true>

export function isFlagKind(value: unknown): value is Flag["kind"] {
  return typeof value === "string" && Object.hasOwn(flagKinds, value)
}

/**
 * Runs the handler for the flag's kind. Every caller passes a handler for each kind, so a new kind
 * fails to compile at each caller until it handles that kind.
 */
export function byKind<TResult>(
  flag: Flag,
  handlers: { [K in Flag["kind"]]: (flag: Extract<Flag, { kind: K }>) => TResult }
): TResult {
  switch (flag.kind) {
    case "boolean":
      return handlers.boolean(flag)
    case "variant":
      return handlers.variant(flag)
  }
}

/**
 * The values of a list of flags, in the same order.
 */
export type FlagValues<TFlags extends readonly Flag[]> = {
  -readonly [K in keyof TFlags]: FlagValue<TFlags[K]>
}

type FlagOptions<T extends string> = {
  /**
   * Overrides the reader's `timeout` for this flag, in milliseconds or as a time expression such as
   * `"500ms"`.
   */
  timeout?: number | ValidateTimeExpression<T>
}

type VariantFlagOptions<TPayload, T extends string> = FlagOptions<T> & {
  /**
   * Parses the variant payload that the provider returns. A throw makes the evaluation return the
   * default with an `InvalidDecisionError`.
   */
  payload?: (payload: unknown) => TPayload
}

const MAX_TIMER_DELAY_MS = 2_147_483_647

function describe(value: unknown): string {
  if (typeof value === "number") return String(value)
  return typeof value === "string" ? JSON.stringify(value) : typeof value
}

/**
 * Reads a deadline given in milliseconds or as a time expression. Throws `FlagDefinitionError` for
 * a value that is not a positive length of time that a timer can wait.
 */
export function parseTimeout(timeout: unknown): number | undefined {
  if (timeout === undefined) return undefined
  const parsed = milliseconds(timeout)
  if (parsed === null || !Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_TIMER_DELAY_MS) {
    throw new FlagDefinitionError(
      `timeout must be a time expression or a number of milliseconds, greater than 0 and no greater than ${MAX_TIMER_DELAY_MS}; received ${describe(timeout)}`
    )
  }
  return parsed
}

function assertKey(key: unknown): asserts key is string {
  if (typeof key !== "string" || key.length === 0) {
    throw new FlagDefinitionError(`key must be a non-empty string; received ${String(key)}`)
  }
}

function assertVariants(variants: unknown, defaultValue: unknown): void {
  if (!Array.isArray(variants) || variants.length === 0) {
    throw new FlagDefinitionError("variants must be a non-empty array")
  }
  for (const variant of variants) {
    if (typeof variant !== "string") {
      throw new FlagDefinitionError(
        `variants must contain only strings; received ${String(variant)}`
      )
    }
  }
  const duplicate = variants.find((variant, index) => variants.indexOf(variant) !== index)
  if (duplicate !== undefined) {
    throw new FlagDefinitionError(`variants must be unique; duplicate value: ${String(duplicate)}`)
  }
  if (!variants.includes(defaultValue)) {
    throw new FlagDefinitionError(
      `defaultValue must be one of the variants; received ${String(defaultValue)}`
    )
  }
}

export const flag = {
  /**
   * Defines a boolean flag.
   *
   * @example
   *   export const betaAccess = flag.boolean("beta-access", false)
   */
  boolean<const T extends string = never>(
    key: string,
    defaultValue: boolean,
    options: FlagOptions<T> = {}
  ): BooleanFlag {
    assertKey(key)
    if (typeof defaultValue !== "boolean") {
      throw new FlagDefinitionError(
        `defaultValue must be a boolean; received ${String(defaultValue)}`
      )
    }
    const timeout = parseTimeout(options.timeout)
    return Object.freeze({ defaultValue, key, kind: "boolean", timeout })
  },

  /**
   * Defines a flag with string variants. The variants come from the array, and the payload type
   * comes from the `payload` parser.
   *
   * @example
   *   export const theme = flag.variant("theme", ["light", "dark"], "light", {
   *     payload: parseTheme,
   *   })
   */
  variant<
    const TVariants extends readonly [string, ...string[]],
    TPayload = unknown,
    const T extends string = never,
  >(
    key: string,
    variants: TVariants,
    defaultValue: NoInfer<TVariants[number]>,
    options: VariantFlagOptions<TPayload, T> = {}
  ): VariantFlag<TVariants[number], TPayload> {
    assertKey(key)
    assertVariants(variants, defaultValue)
    const timeout = parseTimeout(options.timeout)
    if (options.payload !== undefined && typeof options.payload !== "function") {
      throw new FlagDefinitionError("payload must be a function")
    }
    return Object.freeze({
      defaultValue,
      key,
      kind: "variant",
      payload: options.payload,
      timeout,
      variants: Object.freeze([...variants]),
    })
  },
}
