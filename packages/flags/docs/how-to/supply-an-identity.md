# How to supply an identity

This guide shows you how to give the provider the identity that it evaluates. Each identity has a `distinctId`, a string or a number. The provider's identity type sets which other fields it needs.

## Resolve the identity in the reader

If your application has one current user, such as a browser session, give `createFlags` an `identify` function:

```typescript
const flags = createFlags({
  provider,
  identify: () => ({ distinctId: session.userId, email: session.email }),
})

await flags.get(betaAccess)
```

`identify` can be async. It runs once for each read, and once for a whole `getMany`, `detailsMany`, or `snapshot` call. If it returns `null` or `undefined`, or throws, the read returns the default with an `IdentityNotFoundError`.

## Name the identity for each read

If the caller already has the identity, such as a request handler on a server, leave out `identify`. The reader then has no `get`, so TypeScript requires you to read through `for`:

```typescript
const serverFlags = createFlags({ provider })

app.get("/checkout", async (request) => {
  const flags = serverFlags.for(request.user)
  const enabled = await flags.get(checkout, { signal: request.signal })
})
```

A reader with `identify` also has `for`, to read for another identity once.

TypeScript checks the identity against the provider's identity type, both in `identify` and in `for`.

## Evaluate without an identity

If the provider accepts `anonymous`, return it from `identify`, or pass it to `for`:

```typescript
import { anonymous } from "@sanely/flags"

const flags = createFlags({ provider, identify: () => session.user ?? anonymous })
```

A provider accepts `anonymous` only when its `identity` parameter includes `Anonymous`. See [How to write a provider](./write-a-provider.md#allow-anonymous-evaluation).

The package does not store or coalesce an anonymous evaluation, because many visitors share it.
