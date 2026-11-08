import { FlagDefinitionError } from "#lib/errors/index.ts"

/**
 * A flag that evaluates to `true` or `false`.
 */
export type BooleanFlag = {
  readonly kind: "boolean"
  readonly key: string
  readonly defaultValue: boolean
  readonly timeoutMs: number | undefined
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
  readonly timeoutMs: number | undefined
}

/**
 * Any flag definition.
 */
export type Flag = BooleanFlag | VariantFlag

export type FlagValue<TFlag extends Flag> =
  TFlag extends VariantFlag<infer TVariant, infer _TPayload> ? TVariant : boolean

export type FlagPayload<TFlag extends Flag> =
  TFlag extends VariantFlag<string, infer TPayload> ? TPayload : never

/**
 * The values of a list of flags, in the same order.
 */
export type FlagValues<TFlags extends readonly Flag[]> = {
  -readonly [K in keyof TFlags]: FlagValue<TFlags[K]>
}

type FlagOptions = {
  /**
   * Overrides the reader's `timeoutMs` for this flag.
   */
  timeoutMs?: number
}

type VariantFlagOptions<TPayload> = FlagOptions & {
  /**
   * Parses the variant payload that the provider returns. A throw makes the evaluation return the
   * default with an `InvalidDecisionError`.
   */
  payload?: (payload: unknown) => TPayload
}

const MAX_TIMER_DELAY_MS = 2_147_483_647

export function assertTimeoutMs(timeoutMs: unknown): asserts timeoutMs is number | undefined {
  if (
    timeoutMs !== undefined
    && (typeof timeoutMs !== "number"
      || !Number.isFinite(timeoutMs)
      || timeoutMs <= 0
      || timeoutMs > MAX_TIMER_DELAY_MS)
  ) {
    throw new FlagDefinitionError(
      `timeoutMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}; received ${typeof timeoutMs === "number" ? String(timeoutMs) : typeof timeoutMs}`
    )
  }
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
  boolean(key: string, defaultValue: boolean, options: FlagOptions = {}): BooleanFlag {
    assertKey(key)
    if (typeof defaultValue !== "boolean") {
      throw new FlagDefinitionError(
        `defaultValue must be a boolean; received ${String(defaultValue)}`
      )
    }
    assertTimeoutMs(options.timeoutMs)
    return Object.freeze({ defaultValue, key, kind: "boolean", timeoutMs: options.timeoutMs })
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
  variant<const TVariants extends readonly [string, ...string[]], TPayload = unknown>(
    key: string,
    variants: TVariants,
    defaultValue: NoInfer<TVariants[number]>,
    options: VariantFlagOptions<TPayload> = {}
  ): VariantFlag<TVariants[number], TPayload> {
    assertKey(key)
    assertVariants(variants, defaultValue)
    assertTimeoutMs(options.timeoutMs)
    if (options.payload !== undefined && typeof options.payload !== "function") {
      throw new FlagDefinitionError("payload must be a function")
    }
    return Object.freeze({
      defaultValue,
      key,
      kind: "variant",
      payload: options.payload,
      timeoutMs: options.timeoutMs,
      variants: Object.freeze([...variants]),
    })
  },
}
