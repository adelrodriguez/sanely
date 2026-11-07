# How to supply an identity

This guide shows you how to give a gate the identity that the provider evaluates. Each identity must have a `distinctId`, a string or a number.

## Resolve the identity in the factory

If your application has one shared identity source, such as a browser session, use `identify`:

```typescript
const gate = buildGate({
  identify: () => ({ distinctId: session.userId }),
  decide: (key, identity) => provider.evaluate(key, identity),
})
```

`identify` can be async. If it returns `null`, the evaluation returns its default with an `IdentityNotFoundError`.

To use another identity for one evaluation, pass it in the call:

```typescript
await betaAccess({ identity: { distinctId: "test-user" } })
```

## Supply the identity for each call

If the caller already has the identity, such as a request handler on a server, leave out `identify`, and give the identity type as a type argument:

```typescript
type UserIdentity = {
  distinctId: string
  plan: "free" | "pro"
}

const gate = buildGate<UserIdentity>({
  decide: (key, identity, { signal } = {}) => provider.evaluate(key, identity, { signal }),
})

const checkout = gate({ key: "checkout", defaultValue: false })

await checkout({ identity: request.user })
```

In this mode, TypeScript requires an identity for each evaluator call, each `details()` call, and each `batch()` call.

## Allow anonymous evaluation

Identity resolution is strict by default. If your provider supports anonymous subjects, set `anonymous: "allow"`. Hooks and `decide` can then receive `null`:

```typescript
const gate = buildGate({
  anonymous: "allow",
  identify: (): UserIdentity | null => null,
  decide: (key, identity) => provider.evaluate(key, identity),
})

const landingPage = gate({ key: "landing-page", defaultValue: false })

await landingPage({ identity: null })
```

The package does not cache or coalesce anonymous evaluations.
