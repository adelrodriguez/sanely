# `@sanely/skew/react` reference

The React integration. It needs `react` 18 or later.

## `useDeploymentStatus(options?)`

```ts
function useDeploymentStatus<const T extends string>(
  options?: DeploymentStatusOptions<T>
): DeploymentStatus
```

Subscribes the component to a shared monitor and returns its current `DeploymentStatus`. Without `source`, the hook uses the default monitor, which reads the embed that the adapter wrote into the page. With `source`, the hook uses the shared monitor for that source object. All components with the same source share one monitor and one request.

During server rendering, the hook returns a state with `status: "unknown"`, `checkStatus: "idle"`, `error: null`, `target: null`, `checkedAt: null`, and `reloadStatus: "unprotected"`.

### Options

`DeploymentStatusOptions` extends `DeploymentSubscriberOptions`.

| Option             | Type                  | Default                   | Description                                                                                                                                          |
| ------------------ | --------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checkInterval`    | `number \| string`    | `300000`                  | Milliseconds or a time expression, such as `"5m"`, between checks while the page is visible. Values below `10000` change to `10000`, with a warning. |
| `checkOnReconnect` | `boolean`             | `true`                    | Check when the browser comes back online.                                                                                                            |
| `checkOnSubscribe` | `boolean`             | `true`                    | Check when the first subscriber attaches.                                                                                                            |
| `checkOnVisible`   | `boolean`             | `true`                    | Check when the page becomes visible or the browser restores it from the back-forward cache.                                                          |
| `isCurrent`        | `IsDeploymentCurrent` | Exact deployment ID match | Decides whether the running deployment is current for a target.                                                                                      |
| `source`           | `DeploymentSource`    | The source from the embed | Uses the shared monitor for this source.                                                                                                             |

The hook compares a new options object with the previous one key by key. An inline object with the same values does not subscribe again. `source` and `isCurrent` compare by reference. Define them at module scope or memoize them.

When several subscribers share a monitor, the monitor combines their options. See [One shared monitor serves all subscribers](../explanation/how-skew-detects-a-stale-client.md#one-shared-monitor-serves-all-subscribers).

### Return value

`DeploymentStatus`. See [`DeploymentStatus`](./core.md#deploymentstatus) in the core reference.

## Re-exported types

`@sanely/skew/react` re-exports these types from `@sanely/skew`: `CheckStatus`, `Deployment`, `DeploymentMonitor`, `DeploymentSource`, `DeploymentStatus`, `DeploymentSubscriberOptions`, `IsDeploymentCurrent`, and `ReloadStatus`. It also exports `DeploymentStatusOptions`.
