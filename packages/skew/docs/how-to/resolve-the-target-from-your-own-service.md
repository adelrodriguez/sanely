# How to resolve the target from your own service

By default, the client reads its target from the descriptor that the adapter writes. Use this guide when another service decides the target, for example a release service that pins tenants to versions.

## If your service returns the descriptor format

Set the adapter `endpoint` to the service URL. The client then fetches it with no other change:

```ts
deploymentCheck({ endpoint: "https://deployments.example.com/current.json" })
```

The service must return the [descriptor format](../reference/descriptor.md) with `Cache-Control: no-store`. If the request needs headers or credentials, create the source yourself:

```ts
import { createHttpSource } from "@sanely/skew"

export const source = createHttpSource(
  { id: import.meta.env.VITE_RELEASE_ID },
  "https://deployments.example.com/current.json",
  {
    credentials: "include",
    headers: { authorization: `Bearer ${token}` },
  }
)
```

Pass `source` to `useDeploymentStatus({ source })`. Create it once at module scope.

## If your service returns another format

Implement `DeploymentSource`:

```ts
import type { DeploymentSource } from "@sanely/skew"

export const source: DeploymentSource = {
  running: { id: import.meta.env.VITE_RELEASE_ID },
  async resolveTarget(signal) {
    const response = await fetch("https://releases.example.com/api/active", { signal })
    const release = (await response.json()) as { version: string }
    return { id: release.version }
  },
}
```

Follow these rules:

- Send the request to a service that the running deployment does not control. If the old deployment answers, the client never sees a new target.
- Pass `signal` to `fetch`. The monitor aborts a check after 30 seconds and when the last subscriber leaves.
- Throw on a failure. The monitor stores the error in `error` and keeps the last status.

## Use the source without React

```ts
import { getMonitor } from "@sanely/skew"

const monitor = getMonitor(source)
const unsubscribe = monitor.subscribe((state) => {
  if (state.status === "stale") {
    showUpdateBanner(state.target.id)
  }
})
```

The [core reference](../reference/core.md) describes the monitor API.
