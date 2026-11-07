<div align="center">
  <h1 align="center">🥬 <code>@sanely/skew</code></h1>

  <p align="center">
    <strong>Know when an open tab runs an old deployment.</strong>
  </p>
</div>

A browser tab can stay open for days while you deploy many times. The package tells the tab when a newer deployment is live, so your app can ask the user to reload. The package never reloads the page by itself.

At build time, an adapter writes the deployment ID into the page and into `/_deployment-check/deployment.json`. In the browser, the package fetches that file when the tab becomes visible, when the network comes back, and every 5 minutes. If the IDs differ, the status is `stale`.

## Quick start

`@sanely/skew` supports Vite 5 or later, Next.js 15 or later, and React 18 or later.

```sh
npm install @sanely/skew
```

Add the adapter to `vite.config.ts`:

```ts
import { deploymentCheck } from "@sanely/skew/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), deploymentCheck()],
})
```

Show a notice when the tab is stale:

```tsx
import { useDeploymentStatus } from "@sanely/skew/react"

export function UpdateNotice() {
  const deployment = useDeploymentStatus()

  if (deployment.status !== "stale") {
    return null
  }

  return (
    <aside>
      <p>A new version is available.</p>
      <button type="button" onClick={deployment.reload}>
        Reload
      </button>
    </aside>
  )
}
```

Then configure your host to serve `/_deployment-check/deployment.json` with `Cache-Control: no-store`. See [How to stop hosts from caching the descriptor](docs/how-to/stop-hosts-from-caching-the-descriptor.md).

For Next.js, follow [How to add `@sanely/skew` to a Next.js app](docs/how-to/add-skew-to-a-nextjs-app.md).

## Documentation

How-to guides:

- [Add `@sanely/skew` to a Vite app](docs/how-to/add-skew-to-a-vite-app.md)
- [Add `@sanely/skew` to a Next.js app](docs/how-to/add-skew-to-a-nextjs-app.md)
- [Set the deployment ID](docs/how-to/set-the-deployment-id.md)
- [Preview the update notice in development](docs/how-to/preview-the-update-notice.md)
- [Stop hosts from caching the descriptor](docs/how-to/stop-hosts-from-caching-the-descriptor.md)
- [Resolve the target from your own service](docs/how-to/resolve-the-target-from-your-own-service.md)

Reference:

- [`@sanely/skew/react`](docs/reference/react.md)
- [`@sanely/skew`](docs/reference/core.md): monitors, sources, and types
- [`@sanely/skew/vite` and `@sanely/skew/next`](docs/reference/adapters.md)
- [Descriptor and embed formats](docs/reference/descriptor.md)

Explanation:

- [How `@sanely/skew` detects a stale client](docs/explanation/how-skew-detects-a-stale-client.md)

To work on the package itself, read [CONTRIBUTING.md](CONTRIBUTING.md).

Made with [🥐 `pastry`](https://github.com/adelrodriguez/pastry).
