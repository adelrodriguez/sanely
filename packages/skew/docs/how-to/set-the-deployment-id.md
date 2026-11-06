# How to set the deployment ID

On Vercel, Cloudflare Pages, Netlify, and GitHub Actions, the adapter finds the commit SHA without help. Use this guide when you build somewhere else, or when you want an ID that is not a commit SHA.

Use the same ID for every build of one deployment. If two servers build the same release with different IDs, each tab sees the other server's ID as a newer deployment.

## Read the ID from an environment variable

To use a variable that your CI sets, pass its name:

```ts
crispen({ deploymentId: { env: "RELEASE_ID" } })
```

To try several variables, pass a list. The adapter uses the first one that is not empty:

```ts
crispen({ deploymentId: { env: ["RELEASE_ID", "GIT_SHA"] } })
```

## Read the commit SHA of one platform

To skip detection and read one platform's variable, name the platform:

```ts
crispen({ deploymentId: { platform: "vercel" } })
```

The values are `"vercel"`, `"cloudflare-pages"`, `"netlify"`, and `"github-actions"`.

## Compute the ID

To compute the ID at build time, pass a function:

```ts
import { execSync } from "node:child_process"

crispen({
  deploymentId: () => execSync("git rev-parse HEAD").toString().trim(),
})
```

## Pass the ID directly

```ts
crispen({ deploymentId: process.env.RELEASE_ID })
```

An empty or missing string falls back to detection.

## Check the result

If a strategy finds nothing, the adapter logs this warning in the build output and uses a random ID:

```text
Crispen could not resolve a deployment ID from the RELEASE_ID environment variable. This build uses a random ID.
```

To see the ID of a build, open `/_crispen/deployment.json` and read `id`.

The same options work for `withCrispen` in `@sanely/skew/next`, as its second argument. The [adapters reference](../reference/adapters.md#deployment-id) lists the full resolution rules.
