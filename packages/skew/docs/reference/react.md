# `@sanely/skew/react` reference

The React integration. It needs `react` 18 or later.

## `useDeploymentStatus(monitor?)`

```ts
function useDeploymentStatus(monitor?: DeploymentMonitor): DeploymentStatus
```

Subscribes the component to `monitor` and returns its current `DeploymentStatus`. Without `monitor`, the hook uses a default monitor that reads the embed that the adapter wrote into the page. All components that use the same monitor share one schedule and one request.

```tsx
const { status, reload } = useDeploymentStatus()
```

To change the schedule, the target, or the comparison, create the monitor with [`createDeploymentMonitor`](./core.md#createdeploymentmonitoroptions) at module scope and pass it to the hook. A monitor that a component creates during render is a new monitor on every render.

During server rendering, the hook returns a state with `status: "unknown"`, `checkStatus: "idle"`, `error: null`, `target: null`, `checkedAt: null`, and `reloadStatus: "unprotected"`.

### Return value

`DeploymentStatus`. See [`DeploymentStatus`](./core.md#deploymentstatus) in the core reference.

## Re-exported types

`@sanely/skew/react` re-exports these types from `@sanely/skew`: `Deployment`, `DeploymentMonitor`, and `DeploymentStatus`.
