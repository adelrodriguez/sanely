# How to resolve the target from your own service

By default, the client reads its target from the descriptor that the adapter writes. Use this guide when another service decides the target, for example a release service that pins tenants to versions.

## If your service returns the descriptor format

Set the adapter `endpoint` to the service URL. The client then fetches it with no other change:

```ts
deploymentCheck({ endpoint: "https://deployments.example.com/current.json" })
```

The service must return the [descriptor format](../reference/descriptor.md) with `Cache-Control: no-store`. If the service runs on another origin, it must also allow the app origin with an `Access-Control-Allow-Origin` header, or the browser blocks the response.

If the request needs headers or credentials, create a monitor with `fetchDescriptor` at module scope:

```ts
import { createDeploymentMonitor, fetchDescriptor } from "@sanely/skew"

export const monitor = createDeploymentMonitor({
  target: fetchDescriptor("https://deployments.example.com/current.json", {
    credentials: "include",
    headers: { authorization: `Bearer ${token}` },
  }),
})
```

Pass `monitor` to `useDeploymentStatus(monitor)`.

## If your service returns another format

Give the monitor a `target` function that returns a `Deployment`:

```ts
import { createDeploymentMonitor } from "@sanely/skew"

export const monitor = createDeploymentMonitor({
  async target(signal) {
    const response = await fetch("https://releases.example.com/api/active", { signal })
    const release: unknown = await response.json()
    if (typeof release !== "object" || release === null || !("version" in release)) {
      throw new Error("The release service returned an unexpected response.")
    }
    return { id: String(release.version) }
  },
})
```

Follow these rules:

- Send the request to a service that the running deployment does not control. If the old deployment answers, the client never sees a new target.
- Return IDs in the same form as the adapter's deployment ID. The monitor reads the running ID from the embed. See [How to set the deployment ID](./set-the-deployment-id.md).
- Pass `signal` to `fetch`. The monitor aborts a check after `checkTimeout`, 30 seconds by default, and when the last subscriber leaves.
- Throw on a failure. The monitor stores the error in `error` and keeps the last status.

## Use the monitor without React

```ts
const unsubscribe = monitor.subscribe((state) => {
  if (state.status === "stale") {
    showUpdateBanner(state.target.id)
  }
})
```

The [core reference](../reference/core.md) describes the monitor API.
