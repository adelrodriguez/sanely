// Compile-time checks only: `pnpm run check` enforces this file, and Vitest never runs it.
import { expectTypeOf } from "vitest"
import type {
  AnonymousFlagFactoryConfig,
  CallerIdentityFlagFactoryConfig,
  Decision,
  DecisionSource,
  EvaluationDetails,
  FlagBatch,
  FlagCallOptions,
  FlagFactoryConfig,
  FlagEvaluator,
  FlagFactory,
  Hook,
  HookContext,
  Identity,
  FlagError,
  InvalidVariantError,
} from "#index.ts"
import type {
  FlagBatchIdentityOf,
  FlagBatchValuesOf,
  FlagDetailsOf,
  FlagHooks,
  FlagIdentityOf,
  FlagValueOf,
  ReactFlagCache,
} from "#integrations/react/index.tsx"
import { defineHook as defineHookFromHooks } from "#hooks/index.ts"
import { createFlags, decision, defineHook } from "#index.ts"
import {
  createFlagCache,
  createFlagHooks,
  FeatureFlag,
  FlagProvider,
  useFlag,
  useFlagBatch,
  useFlagCache,
} from "#integrations/react/index.tsx"

// ── Test fixtures ────────────────────────────────────────────────────────────
interface ConsumerIdentity extends Identity {
  plan: "free" | "pro"
}

interface OrganizationIdentity extends Identity {
  organizationId: string
}

type Theme = "light" | "dark"
type ThemePayload = { experiment: string }

const factory = createFlags<ConsumerIdentity>({
  decide: () => decision.boolean(true),
  identify: () => ({ distinctId: "consumer", plan: "pro" }),
})
const anonymousFactory = createFlags<ConsumerIdentity>({
  anonymous: "allow",
  decide: () => decision.boolean(true),
  identify: () => null,
})
const callerFactory = createFlags<ConsumerIdentity>({
  decide: () => decision.boolean(true),
})

const booleanFlag = factory({ defaultValue: false, key: "beta" })
const variantFlag = factory<ThemePayload, ["light", "dark"]>({
  defaultValue: "light",
  key: "theme",
  variants: ["light", "dark"],
})
const organizationFactory = createFlags<OrganizationIdentity>({
  decide: () => decision.boolean(true),
  identify: () => ({ distinctId: "consumer", organizationId: "org" }),
})
const organizationFlag = organizationFactory({ defaultValue: false, key: "beta" })
const wideFactory = createFlags<Identity>({
  decide: () => decision.boolean(true),
  identify: () => ({ distinctId: "consumer" }),
})
const wideFlag = wideFactory({ defaultValue: false, key: "beta" })
const anonymousFlag = anonymousFactory({ defaultValue: false, key: "beta" })
const callerFlag = callerFactory({ defaultValue: false, key: "beta" })

type Flags = readonly [typeof booleanFlag, typeof variantFlag]

const consumerHooks = createFlagHooks(factory)

// ── Positive type-level tests ────────────────────────────────────────────────
// Returns a factory that resolves the configured identity for each call.
{
  expectTypeOf(factory).toEqualTypeOf<FlagFactory<ConsumerIdentity>>()
}

// Lets an anonymous factory accept a null caller identity.
{
  expectTypeOf(anonymousFactory).toEqualTypeOf<
    FlagFactory<ConsumerIdentity, ConsumerIdentity | null>
  >()
}

// Requires caller identity when the config has no identify function.
{
  expectTypeOf(callerFactory).toEqualTypeOf<FlagFactory<ConsumerIdentity, ConsumerIdentity, true>>()
}

// Infers the identity type from identify when no type argument is given.
{
  const inferred = createFlags({
    decide: () => decision.boolean(true),
    identify: () => ({ distinctId: 1, team: "core" }),
  })

  expectTypeOf(inferred).toEqualTypeOf<FlagFactory<{ distinctId: number; team: string }>>()
}

// Types the identity passed to decide, decideMany, hooks, and error callbacks.
{
  createFlags<ConsumerIdentity>({
    decide: (key, identity) => {
      expectTypeOf(key).toEqualTypeOf<string>()
      expectTypeOf(identity).toEqualTypeOf<ConsumerIdentity>()
      return decision.boolean(true)
    },
    decideMany: (keys, identity) => {
      expectTypeOf(keys).toEqualTypeOf<readonly string[]>()
      expectTypeOf(identity).toEqualTypeOf<ConsumerIdentity>()
      return {}
    },
    hooks: [
      {
        before: (context) => {
          expectTypeOf(context.identity).toEqualTypeOf<ConsumerIdentity | null>()
        },
      },
    ],
    identify: () => null,
    onCacheError: (report) => {
      expectTypeOf(report.identity).toEqualTypeOf<ConsumerIdentity | null>()
    },
    onHookError: (report) => {
      expectTypeOf(report.phase).toEqualTypeOf<"before" | "after" | "error" | "finally">()
    },
  })

  createFlags<ConsumerIdentity>({
    anonymous: "allow",
    decide: (_key, identity) => {
      expectTypeOf(identity).toEqualTypeOf<ConsumerIdentity | null>()
      return decision.boolean(true)
    },
    identify: () => null,
  })
}

// Exports the three config shapes that createFlags accepts.
{
  expectTypeOf<AnonymousFlagFactoryConfig<ConsumerIdentity>["anonymous"]>().toEqualTypeOf<"allow">()
  expectTypeOf<FlagFactoryConfig<ConsumerIdentity>["anonymous"]>().toEqualTypeOf<
    "reject" | undefined
  >()
  expectTypeOf<
    CallerIdentityFlagFactoryConfig<ConsumerIdentity>["identify"]
  >().toEqualTypeOf<undefined>()
}

// Types boolean flags as boolean evaluators.
{
  expectTypeOf(booleanFlag).toEqualTypeOf<
    FlagEvaluator<ConsumerIdentity, boolean, ConsumerIdentity>
  >()
  expectTypeOf(booleanFlag).returns.resolves.toEqualTypeOf<boolean>()
  expectTypeOf(booleanFlag).parameters.toEqualTypeOf<
    [options?: FlagCallOptions<ConsumerIdentity>]
  >()
}

// Keeps the identity marker out of the string keys of a flag.
{
  expectTypeOf<Extract<keyof typeof booleanFlag, string>>().toEqualTypeOf<"details">()
}

// Types variant flags with the variant union and payload type.
{
  expectTypeOf(variantFlag).toEqualTypeOf<
    FlagEvaluator<ConsumerIdentity, Theme, ConsumerIdentity, ThemePayload>
  >()
  expectTypeOf(variantFlag).returns.resolves.toEqualTypeOf<Theme>()
}

// Infers the variant union from a variants literal without type arguments.
{
  const flag = factory({
    defaultValue: "light",
    key: "theme",
    variants: ["light", "dark", "system"],
  })

  expectTypeOf<FlagValueOf<typeof flag>>().toEqualTypeOf<"light" | "dark" | "system">()
  expectTypeOf<FlagDetailsOf<typeof flag>>().toEqualTypeOf<
    EvaluationDetails<"light" | "dark" | "system">
  >()
}

// Accepts a null identity only on anonymous factory flags.
{
  expectTypeOf(anonymousFlag).parameters.toEqualTypeOf<
    [options?: FlagCallOptions<ConsumerIdentity | null>]
  >()

  void anonymousFlag({ identity: null })
}

// Requires an identity on every call from a caller-identity factory.
{
  expectTypeOf(callerFlag).parameter(0).toHaveProperty("identity").toEqualTypeOf<ConsumerIdentity>()

  void callerFlag({ identity: { distinctId: "consumer", plan: "free" } })
  void callerFactory.batch([callerFlag], { identity: { distinctId: "consumer", plan: "free" } })
}

// Types evaluation details for boolean and variant flags.
{
  expectTypeOf(booleanFlag.details).returns.resolves.toEqualTypeOf<EvaluationDetails<boolean>>()
  expectTypeOf<FlagDetailsOf<typeof variantFlag>>().toEqualTypeOf<
    EvaluationDetails<Theme, ThemePayload>
  >()
}

// Exposes a payload only on variant evaluation details.
{
  expectTypeOf<keyof EvaluationDetails<boolean>>().toEqualTypeOf<
    "error" | "flagKey" | "source" | "value"
  >()
  expectTypeOf<EvaluationDetails<Theme, ThemePayload>["payload"]>().toEqualTypeOf<
    ThemePayload | undefined
  >()
}

// Narrows evaluation details to an error only for the default source.
function _narrowDetails(details: EvaluationDetails<Theme>): void {
  if (details.source === "default") {
    expectTypeOf(details.error).toEqualTypeOf<Error>()
  } else {
    expectTypeOf(details.source).toEqualTypeOf<DecisionSource>()
    expectTypeOf(details.error).toEqualTypeOf<undefined>()
  }
}

// Extracts flag value, identity, and details types for React consumers.
{
  expectTypeOf<FlagValueOf<typeof booleanFlag>>().toEqualTypeOf<boolean>()
  expectTypeOf<FlagValueOf<typeof variantFlag>>().toEqualTypeOf<Theme>()
  expectTypeOf<FlagIdentityOf<typeof booleanFlag>>().toEqualTypeOf<ConsumerIdentity>()
  expectTypeOf<FlagIdentityOf<typeof anonymousFlag>>().toEqualTypeOf<ConsumerIdentity>()
  expectTypeOf<FlagIdentityOf<typeof callerFlag>>().toEqualTypeOf<ConsumerIdentity>()
  expectTypeOf<FlagIdentityOf<typeof wideFlag>>().toEqualTypeOf<Identity>()
  expectTypeOf<FlagDetailsOf<typeof variantFlag>>().toEqualTypeOf<
    EvaluationDetails<Theme, ThemePayload>
  >()
  expectTypeOf<FlagBatchValuesOf<Flags>>().toEqualTypeOf<Readonly<[boolean, Theme]>>()
  expectTypeOf<FlagBatchIdentityOf<Flags>>().toEqualTypeOf<ConsumerIdentity>()
}

// Types a React batch identity as the intersection of the flag identity types.
{
  expectTypeOf<
    FlagBatchIdentityOf<readonly [typeof booleanFlag, typeof organizationFlag]>
  >().toEqualTypeOf<ConsumerIdentity & OrganizationIdentity>()
  expectTypeOf<
    FlagBatchIdentityOf<readonly [typeof organizationFlag]>
  >().toEqualTypeOf<OrganizationIdentity>()
  expectTypeOf<
    FlagBatchIdentityOf<readonly [typeof booleanFlag, typeof anonymousFlag]>
  >().toEqualTypeOf<ConsumerIdentity>()
  expectTypeOf<
    FlagBatchIdentityOf<Array<typeof booleanFlag | typeof organizationFlag>>
  >().toEqualTypeOf<ConsumerIdentity & OrganizationIdentity>()
  expectTypeOf<FlagBatchIdentityOf<readonly []>>().toEqualTypeOf<Identity>()
}

// Accepts a React batch identity that satisfies every flag identity type.
function MixedIdentityConsumer(): null {
  const batch = useFlagBatch([booleanFlag, organizationFlag], {
    identity: { distinctId: "consumer", organizationId: "org", plan: "pro" },
  })

  expectTypeOf(batch).toEqualTypeOf<Readonly<[boolean, boolean]>>()

  return null
}

// Types batch results as a readonly tuple with typed get and details lookups.
async function _batch(): Promise<void> {
  const batch = await factory.batch([booleanFlag, variantFlag])

  expectTypeOf(batch).toEqualTypeOf<FlagBatch<Flags>>()
  expectTypeOf(batch[0]).toEqualTypeOf<boolean>()
  expectTypeOf(batch[1]).toEqualTypeOf<Theme>()
  expectTypeOf(batch.length).toEqualTypeOf<2>()

  const value = batch.get(variantFlag)
  const details = batch.details(variantFlag)

  expectTypeOf(value).toEqualTypeOf<Theme>()
  expectTypeOf(details).toEqualTypeOf<EvaluationDetails<Theme, ThemePayload>>()
}

// Types decision helpers as members of the Decision union.
{
  const booleanDecision = decision.boolean(true)
  const variantDecision = decision.variant("dark", { experiment: "a" })
  const untypedVariant = decision.variant("dark")

  expectTypeOf(booleanDecision).toEqualTypeOf<{ type: "boolean"; value: boolean }>()
  expectTypeOf(variantDecision).toEqualTypeOf<{
    type: "variant"
    variant: string
    payload?: ThemePayload
  }>()
  expectTypeOf(untypedVariant).toEqualTypeOf<{
    type: "variant"
    variant: string
    payload?: unknown
  }>()
  expectTypeOf(variantDecision).toExtend<Decision<ThemePayload>>()
}

// Types hook contexts by flag kind.
function _narrowHookContext(context: HookContext<ConsumerIdentity>): void {
  if (context.kind === "variant") {
    expectTypeOf(context.defaultValue).toEqualTypeOf<string>()
    expectTypeOf(context.variants).toEqualTypeOf<readonly string[]>()
  } else {
    expectTypeOf(context.defaultValue).toEqualTypeOf<boolean>()
    expectTypeOf(context.variants).toEqualTypeOf<undefined>()
  }
}

// Types defineHook objects and factories from the root and hooks entrypoints.
{
  const hook = defineHook<ConsumerIdentity>({
    after: (context, result, meta) => {
      expectTypeOf(context.identity).toEqualTypeOf<ConsumerIdentity | null>()
      expectTypeOf(result).toEqualTypeOf<Decision>()
      expectTypeOf(meta.source).toEqualTypeOf<DecisionSource>()
    },
  })
  const required = defineHook((options: { prefix: string }) => ({
    before: () => {
      void options.prefix
    },
  }))
  const optional = defineHookFromHooks((options?: { prefix: string }) => ({
    before: () => {
      void options?.prefix
    },
  }))

  expectTypeOf(hook).toEqualTypeOf<Hook<ConsumerIdentity>>()
  expectTypeOf(required).toEqualTypeOf<(options: { prefix: string }) => Hook>()
  expectTypeOf(optional).toEqualTypeOf<(options?: { prefix: string }) => Hook>()
  expectTypeOf(defineHook).toEqualTypeOf(defineHookFromHooks)
}

// Exports error classes that extend FlagError.
{
  expectTypeOf<InvalidVariantError>().toExtend<FlagError>()
  expectTypeOf<InvalidVariantError["allowedVariants"]>().toEqualTypeOf<readonly string[]>()
}

// Types the React hooks from the flag type.
function Consumer(): null {
  const value = useFlag(booleanFlag)
  const details = useFlag(booleanFlag, { details: true })
  const variant = useFlag(variantFlag, { identity: { distinctId: "consumer", plan: "pro" } })
  const batch = useFlagBatch([booleanFlag, variantFlag])
  const custom = useFlag(() => Promise.resolve(1), { key: ["custom", 1] })
  const cache = useFlagCache()

  expectTypeOf(value).toEqualTypeOf<boolean>()
  expectTypeOf(details).toEqualTypeOf<EvaluationDetails<boolean>>()
  expectTypeOf(variant).toEqualTypeOf<Theme>()
  expectTypeOf(batch).toEqualTypeOf<Readonly<[boolean, Theme]>>()
  expectTypeOf(custom).toEqualTypeOf<number>()
  expectTypeOf(cache).toEqualTypeOf<ReactFlagCache>()

  return null
}

// Types the React cache and components.
{
  const cache = createFlagCache({ maxEntries: 10, ttlMs: 1000 })

  expectTypeOf(cache).toEqualTypeOf<ReactFlagCache>()

  void cache.prefetch(variantFlag, { identity: { distinctId: "consumer", plan: "pro" } })
  void cache.prefetchBatch([booleanFlag, variantFlag], { ttlMs: 1000 })
  cache.invalidate(booleanFlag, { distinctId: "consumer", plan: "free" })
  cache.invalidateKey(["custom", 1])

  void FlagProvider({ cache, children: null, identity: { distinctId: "consumer" } })
  void FeatureFlag({ children: null, flag: booleanFlag })
  void FeatureFlag({ children: null, flag: variantFlag, match: "dark" })
}

// Types the hooks from createFlagHooks to the factory identity type and call mode.
{
  expectTypeOf(consumerHooks).toEqualTypeOf<FlagHooks<ConsumerIdentity>>()
  expectTypeOf(createFlagHooks(anonymousFactory)).toEqualTypeOf<
    FlagHooks<ConsumerIdentity, ConsumerIdentity | null>
  >()
  expectTypeOf(createFlagHooks(callerFactory)).toEqualTypeOf<
    FlagHooks<ConsumerIdentity, ConsumerIdentity, true>
  >()

  void consumerHooks.FlagProvider({
    children: null,
    identity: { distinctId: "consumer", plan: "pro" },
  })
}

// Infers the createFlagHooks identity type from the return type of identify.
{
  type InferredIdentity = { distinctId: string; plan: "free" | "pro" }
  const user: InferredIdentity = { distinctId: "consumer", plan: "pro" }
  const inferred = createFlags({ decide: () => decision.boolean(true), identify: () => user })
  const inferredAsync = createFlags({
    decide: () => decision.boolean(true),
    identify: () => Promise.resolve(user),
  })
  const inferredAnonymous = createFlags({
    anonymous: "allow",
    decide: () => decision.boolean(true),
    identify: (): InferredIdentity | null => null,
  })

  expectTypeOf(createFlagHooks(inferred)).toEqualTypeOf<FlagHooks<InferredIdentity>>()
  expectTypeOf(createFlagHooks(inferredAsync)).toEqualTypeOf<FlagHooks<InferredIdentity>>()
  expectTypeOf(createFlagHooks(inferredAnonymous)).toEqualTypeOf<
    FlagHooks<InferredIdentity, InferredIdentity | null>
  >()

  void createFlagHooks(inferred).FlagProvider({
    children: null,
    // @ts-expect-error -- the inferred identity requires plan
    identity: { distinctId: "consumer" },
  })
}

function BoundConsumer(): null {
  const value = consumerHooks.useFlag(booleanFlag)
  const details = consumerHooks.useFlag(variantFlag, { details: true })
  const batch = consumerHooks.useFlagBatch([booleanFlag, variantFlag])

  expectTypeOf(value).toEqualTypeOf<boolean>()
  expectTypeOf(details).toEqualTypeOf<EvaluationDetails<Theme, ThemePayload>>()
  expectTypeOf(batch).toEqualTypeOf<Readonly<[boolean, Theme]>>()

  return null
}

// ── Negative type tests ──────────────────────────────────────────────────────
// These verify that invalid usage produces compile-time errors.
// The function bodies never execute — only the type checker matters.

function _negativeTypeTests(): void {
  // @ts-expect-error -- defaultValue must be one of the declared variants
  factory({ defaultValue: "blue", key: "theme", variants: ["light", "dark"] })

  // @ts-expect-error -- a string defaultValue requires variants
  factory({ defaultValue: "light", key: "theme" })

  // @ts-expect-error -- a variant flag requires a string defaultValue
  factory({ defaultValue: false, key: "theme", variants: ["light", "dark"] })

  createFlags<ConsumerIdentity>({
    decide: () => decision.boolean(true),
    // @ts-expect-error -- identify must return the full identity shape
    identify: () => ({ distinctId: "consumer" }),
  })

  createFlags<ConsumerIdentity>({
    // @ts-expect-error -- decide must return a valid decision
    decide: () => ({ type: "boolean", value: "yes" }),
  })

  createFlags({
    decide: () => decision.boolean(true),
    // @ts-expect-error -- distinctId must be a string or a number
    identify: () => ({ distinctId: true }),
  })

  createFlags<ConsumerIdentity>({
    decide: () => decision.boolean(true),
    // @ts-expect-error -- hooks must accept the factory identity
    hooks: [defineHook<{ distinctId: string; org: string }>({})],
  })

  // @ts-expect-error -- plan must be "free" or "pro"
  void booleanFlag({ identity: { distinctId: "consumer", plan: "enterprise" } })

  // @ts-expect-error -- the identity must include plan
  void booleanFlag({ identity: { distinctId: "consumer" } })

  // @ts-expect-error -- only anonymous factories accept a null identity
  void booleanFlag({ identity: null })

  // @ts-expect-error -- caller-identity factories require an identity
  void callerFlag()

  // @ts-expect-error -- caller-identity batches require an identity
  void callerFactory.batch([callerFlag])

  // @ts-expect-error -- batch flags must match the factory identity type
  void factory.batch([booleanFlag, organizationFlag])

  // @ts-expect-error -- batch flags must not have a wider identity type than the factory
  void factory.batch([wideFlag])

  // @ts-expect-error -- a non-anonymous flag does not accept the null identity of an anonymous batch
  void anonymousFactory.batch([booleanFlag])

  // @ts-expect-error -- an anonymous flag does not belong to a non-anonymous factory
  void factory.batch([anonymousFlag])

  // @ts-expect-error -- a caller-identity flag does not belong to a factory with identify
  void factory.batch([callerFlag])

  void callerFactory.batch(
    // @ts-expect-error -- a flag from a factory with identify does not belong to a caller-identity factory
    [booleanFlag],
    { identity: { distinctId: "consumer", plan: "free" } }
  )

  void callerFactory.batch(
    // @ts-expect-error -- an anonymous flag does not belong to a caller-identity factory
    [anonymousFlag],
    { identity: { distinctId: "consumer", plan: "free" } }
  )

  // @ts-expect-error -- a caller-identity flag does not belong to an anonymous factory
  void anonymousFactory.batch([callerFlag])

  // @ts-expect-error -- decision.variant requires a variant name
  decision.variant()

  // @ts-expect-error -- match must be one of the flag variants
  void FeatureFlag({ children: null, flag: variantFlag, match: "blue" })

  // @ts-expect-error -- a variant flag requires match
  void FeatureFlag({ children: null, flag: variantFlag })

  // @ts-expect-error -- the hook factory requires its options
  defineHook((options: { prefix: string }) => ({ before: () => void options.prefix }))()
}

async function _negativeBatchTypeTests(): Promise<void> {
  const batch = await factory.batch([booleanFlag])

  // @ts-expect-error -- the batch does not contain this flag
  batch.get(variantFlag)

  // @ts-expect-error -- batch values are readonly
  batch[0] = true
}

function useInvalidBoundForms(): void {
  void consumerHooks.FlagProvider({
    children: null,
    // @ts-expect-error -- the provider identity must include plan
    identity: { distinctId: "consumer" },
  })
  // @ts-expect-error -- the hooks accept only flags with the factory identity type
  consumerHooks.useFlag(organizationFlag)
  // @ts-expect-error -- the hooks accept only flags with the factory call mode
  consumerHooks.useFlag(anonymousFlag)
  // @ts-expect-error -- every batch flag must have the factory identity type
  consumerHooks.useFlagBatch([booleanFlag, wideFlag])
  // @ts-expect-error -- the hook identity must include plan
  consumerHooks.useFlag(booleanFlag, { identity: { distinctId: "consumer" } })
}

function useInvalidForms(): void {
  // @ts-expect-error -- The function form requires a key.
  useFlag(() => Promise.resolve(1))
  // @ts-expect-error -- The function form does not support evaluation details.
  useFlag(() => Promise.resolve(1), { details: true, key: "custom" })
  // @ts-expect-error -- the identity must match the flag identity
  useFlag(booleanFlag, { identity: { distinctId: "consumer", plan: "enterprise" } })
  useFlagBatch([booleanFlag, organizationFlag], {
    // @ts-expect-error -- the batch identity must satisfy every flag identity type
    identity: { distinctId: "consumer", plan: "pro" },
  })
}

// Suppress unused function warnings — these exist only for type checking.
void _batch
void BoundConsumer
void Consumer
void MixedIdentityConsumer
void _narrowDetails
void _narrowHookContext
void _negativeTypeTests
void _negativeBatchTypeTests
void useInvalidBoundForms
void useInvalidForms
