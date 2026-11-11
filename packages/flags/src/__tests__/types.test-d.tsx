// Compile-time checks only: `pnpm run check` enforces this file, and Vitest never runs it.
import { expectTypeOf } from "vitest"
import type {
  Anonymous,
  CallerFlags,
  EvaluationDetails,
  EvaluationError,
  FlagReader,
  Flags,
  FlagSnapshot,
  Identity,
  InvalidDecisionError,
  InvalidDecisionProblem,
  Provider,
} from "#index.ts"
import { anonymous, createFlags, decision, defineProvider, flag } from "#index.ts"
import { FeatureFlag, FlagsProvider, useFlag, useFlags } from "#integrations/react/index.tsx"
import { fakeProvider } from "#testing/index.ts"

// ── Fixtures ────────────────────────────────────────────────────────────────
type UserIdentity = Identity & { plan: "free" | "pro" }
type Theme = { accent: string }

function parseTheme(payload: unknown): Theme {
  if (typeof payload !== "object" || payload === null) throw new TypeError("not a theme")
  return { accent: String(Reflect.get(payload, "accent")) }
}

const betaAccess = flag.boolean("beta-access", false)
const theme = flag.variant("theme", ["light", "dark", "system"], "light", { payload: parseTheme })
const layout = flag.variant("layout", ["grid", "list"], "grid")

const userProvider = defineProvider({
  decideOne: (_flag, identity: UserIdentity) => decision.boolean(identity.plan === "pro"),
  name: "users",
})
const user: UserIdentity = { distinctId: "u1", plan: "pro" }

// ── Flag definitions ────────────────────────────────────────────────────────
{
  expectTypeOf(betaAccess.defaultValue).toEqualTypeOf<boolean>()
  expectTypeOf(theme.defaultValue).toEqualTypeOf<"light" | "dark" | "system">()
  expectTypeOf(layout.variants).toEqualTypeOf<ReadonlyArray<"grid" | "list">>()
  // @ts-expect-error The default must be one of the variants.
  flag.variant("size", ["s", "m"], "l")
  // @ts-expect-error A boolean flag needs a boolean default.
  flag.boolean("beta", "yes")
  flag.boolean("beta", false, { timeout: "300ms" })
  flag.variant("size", ["s", "m"], "s", { timeout: 300 })
  // @ts-expect-error "M" is ambiguous between minutes and months.
  flag.boolean("beta", false, { timeout: "1M" })
  // @ts-expect-error A timeout is a time expression, not any string.
  flag.variant("size", ["s", "m"], "s", { timeout: "soon" })
}

// ── Providers ───────────────────────────────────────────────────────────────
{
  // The identity type comes from the annotated `identity` parameter.
  expectTypeOf(userProvider).toEqualTypeOf<Provider<UserIdentity>>()

  const bulk = defineProvider({
    decide: (flags, identity: UserIdentity | Anonymous, { signal }) => {
      expectTypeOf(signal).toEqualTypeOf<AbortSignal>()
      expectTypeOf(identity).toEqualTypeOf<UserIdentity | Anonymous>()
      return Object.fromEntries(flags.map((item) => [item.key, decision.boolean(true)]))
    },
    name: "bulk",
  })
  expectTypeOf(bulk).toEqualTypeOf<Provider<UserIdentity | Anonymous>>()

  // Without an annotation, the provider evaluates any identity.
  const plain = defineProvider({ decideOne: () => decision.boolean(true), name: "plain" })
  expectTypeOf(plain).toEqualTypeOf<Provider>()

  // @ts-expect-error A provider takes exactly one of decide and decideOne.
  defineProvider({
    decide: () => ({}),
    decideOne: () => decision.boolean(true),
    name: "both",
  })
  // @ts-expect-error A provider needs decide or decideOne.
  defineProvider({ name: "neither" })
}

// ── Readers ─────────────────────────────────────────────────────────────────
const flags = createFlags({ identify: () => user, provider: userProvider })
const serverFlags = createFlags({ provider: userProvider })
const signedUpAt = new Date(0)
declare const datedOrAnonymous: (Identity & { signedUpAt: Date }) | Anonymous
declare const userOrAnonymous: (Identity & { plan: "pro" }) | Anonymous
const anonymousFlags = createFlags({
  provider: defineProvider({
    decideOne: (_flag, _identity: Identity | Anonymous) => decision.boolean(true),
    name: "anonymous",
  }),
})
const dateFlags = createFlags({
  provider: defineProvider({ decideOne: () => decision.boolean(true), name: "dates" }),
})
{
  expectTypeOf(flags).toEqualTypeOf<Flags<UserIdentity>>()
  expectTypeOf(serverFlags).toEqualTypeOf<CallerFlags<UserIdentity>>()

  // `identify` must return the provider's identity.
  // @ts-expect-error The identity is missing `plan`.
  createFlags({ identify: () => ({ distinctId: "u1" }), provider: userProvider })
  // @ts-expect-error The provider does not accept `anonymous`.
  createFlags({ identify: () => anonymous, provider: userProvider })
  // @ts-expect-error `for` takes the provider's identity.
  serverFlags.for({ distinctId: "u1" })
  // A reader timeout keeps the reader's identity type.
  expectTypeOf(createFlags({ provider: userProvider, timeout: "1s" })).toEqualTypeOf<
    CallerFlags<UserIdentity>
  >()
  // @ts-expect-error "M" is ambiguous between minutes and months.
  createFlags({ provider: userProvider, timeout: "1M" })
  // A reader without `identify` reads only through `for`.
  expectTypeOf(serverFlags).not.toHaveProperty("get")

  expectTypeOf(serverFlags.for(user)).toEqualTypeOf<FlagReader>()
}

// ── Reads are typed by flag value ───────────────────────────────────────────
export async function reads(): Promise<void> {
  expectTypeOf(await flags.get(betaAccess)).toEqualTypeOf<boolean>()
  // The payload parser keeps the variant union (#41).
  expectTypeOf(await flags.get(theme)).toEqualTypeOf<"light" | "dark" | "system">()

  const details = await flags.details(theme)
  expectTypeOf(details.value).toEqualTypeOf<"light" | "dark" | "system">()
  if (details.source === "default") {
    expectTypeOf(details.error).toEqualTypeOf<EvaluationError>()
  } else {
    expectTypeOf(details.payload).toEqualTypeOf<Theme | undefined>()
  }
  expectTypeOf(await flags.details(layout)).toEqualTypeOf<EvaluationDetails<typeof layout>>()

  // `getMany` returns a tuple in order.
  const values = await flags.getMany([betaAccess, theme, layout])
  expectTypeOf(values).toEqualTypeOf<[boolean, "light" | "dark" | "system", "grid" | "list"]>()
  const [, look] = await flags.detailsMany([betaAccess, theme])
  expectTypeOf(look.value).toEqualTypeOf<"light" | "dark" | "system">()

  expectTypeOf(await flags.snapshot([betaAccess])).toEqualTypeOf<FlagSnapshot>()
}

// ── Anonymous evaluation ────────────────────────────────────────────────────
{
  const anonymousProvider = defineProvider({
    decideOne: (_flag, _identity: UserIdentity | Anonymous) => decision.boolean(false),
    name: "anonymous",
  })
  createFlags({ identify: () => anonymous, provider: anonymousProvider })
  createFlags({ identify: () => user, provider: anonymousProvider }).for(anonymous)
}

// ── Testing ─────────────────────────────────────────────────────────────────
{
  const provider = fakeProvider([
    [theme, "dark"],
    [betaAccess, true],
  ])
  createFlags({ identify: () => user, provider })
  provider.set(layout, "list")
  // @ts-expect-error A fake value must be one of the flag's variants.
  fakeProvider([[theme, "blue"]])
  // @ts-expect-error A fake value has the flag's value type.
  provider.set(betaAccess, "yes")
}

// ── React ───────────────────────────────────────────────────────────────────
export function Components() {
  expectTypeOf(useFlag(theme)).toEqualTypeOf<"light" | "dark" | "system">()
  expectTypeOf(useFlags([betaAccess, layout])).toEqualTypeOf<[boolean, "grid" | "list"]>()

  return (
    <>
      <FlagsProvider flags={flags}>
        <FeatureFlag flag={betaAccess}>new</FeatureFlag>
        <FeatureFlag flag={theme} match="dark">
          dark
        </FeatureFlag>
        {/* @ts-expect-error A boolean flag matches `true` and takes no `match`. */}
        <FeatureFlag flag={betaAccess} match>
          never
        </FeatureFlag>
        {/* @ts-expect-error `match` must be one of the flag's variants. */}
        <FeatureFlag flag={theme} match="blue">
          never
        </FeatureFlag>
        {/* @ts-expect-error A variant flag needs `match`. */}
        <FeatureFlag flag={theme}>never</FeatureFlag>
      </FlagsProvider>
      <FlagsProvider flags={serverFlags} identity={user}>
        child
      </FlagsProvider>
      <FlagsProvider flags={flags} cache={{ pendingTtl: 30_000, ttl: "5m" }}>
        child
      </FlagsProvider>
      {/* @ts-expect-error A cache ttl is a time expression, not any string. */}
      <FlagsProvider flags={flags} cache={{ ttl: "soon" }}>
        child
      </FlagsProvider>
      {/* @ts-expect-error A reader without `identify` needs an identity. */}
      <FlagsProvider flags={serverFlags}>child</FlagsProvider>
      <FlagsProvider flags={serverFlags} identity={{ ...user, tags: ["beta"] }}>
        child
      </FlagsProvider>
      {/* @ts-expect-error Each object in an identity union must be keyable, also with anonymous. */}
      <FlagsProvider flags={anonymousFlags} identity={datedOrAnonymous}>
        child
      </FlagsProvider>
      <FlagsProvider flags={anonymousFlags} identity={userOrAnonymous}>
        child
      </FlagsProvider>
      {/* @ts-expect-error The flag cache keys the identity, and it cannot key a Date. */}
      <FlagsProvider flags={dateFlags} identity={{ distinctId: "u1", signedUpAt }}>
        child
      </FlagsProvider>
      {/* @ts-expect-error The identity must match the reader's identity type. */}
      <FlagsProvider flags={flags} identity={{ distinctId: "u1" }}>
        child
      </FlagsProvider>
    </>
  )
}

// ── Errors ──────────────────────────────────────────────────────────────────
{
  // A caller tells the causes of an invalid decision apart by `problem`, not by `reason` text.
  expectTypeOf<InvalidDecisionError["problem"]>().toEqualTypeOf<InvalidDecisionProblem>()
  expectTypeOf<InvalidDecisionProblem>().toEqualTypeOf<
    "kind" | "malformed" | "missing" | "payload" | "variant"
  >()
}
