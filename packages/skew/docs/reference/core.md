# `@sanely/skew` reference

The core package: the protocol and the headless runtime. Its only runtime dependency is [`@sanely/duration`](../../../duration), and it does not import React or an adapter.

## Monitors

### `createDeploymentMonitor(options?)`

```ts
function createDeploymentMonitor<const T extends string>(
  options?: DeploymentMonitorOptions<T>
): DeploymentMonitor
```

Creates a monitor. Without options, the monitor reads the running deployment and the endpoint from the embed. Without a running deployment, from the embed or from `running`, the monitor is inert: its status stays `"unknown"`, it never checks, and it logs one warning outside production.

Each call creates a separate monitor with its own schedule and requests. Create a monitor once, at module scope.

```ts
export const monitor = createDeploymentMonitor({ checkInterval: "1m" })
```

`DeploymentMonitorOptions`:

| Option             | Type                                                   | Default                             | Description                                                                                                                                                                                    |
| ------------------ | ------------------------------------------------------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `target`           | `string \| TargetResolver`                             | The endpoint in the embed           | A descriptor URL, which the monitor reads with `fetchDescriptor`, or a function that resolves the target. Without an endpoint in the embed, the URL is `"/_deployment-check/deployment.json"`. |
| `running`          | `Deployment`                                           | The running deployment in the embed | The deployment that produced this page. Set it for a preview or a test.                                                                                                                        |
| `isCurrent`        | `(running: Deployment, target: Deployment) => boolean` | Exact deployment ID match           | Decides whether the running deployment is current for a target. Must be pure.                                                                                                                  |
| `checkInterval`    | `number \| string`                                     | `300000`                            | Milliseconds or a time expression, such as `"5m"`, between checks while the page is visible. Values below `10000` change to `10000`, with a warning.                                           |
| `checkTimeout`     | `number \| string`                                     | `30000`                             | Milliseconds or a time expression, such as `"10s"`, before a check stops with a timeout error. Must be finite. You cannot turn it off.                                                         |
| `checkOnReconnect` | `boolean`                                              | `true`                              | Check when the browser comes back online.                                                                                                                                                      |
| `checkOnSubscribe` | `boolean`                                              | `true`                              | Check when the first subscriber attaches.                                                                                                                                                      |
| `checkOnVisible`   | `boolean`                                              | `true`                              | Check when the page becomes visible or the browser restores it from the back-forward cache.                                                                                                    |
| `environment`      | `RuntimeEnvironment`                                   | The browser environment             | Timers, events, storage, and reload. Replace it in tests or in a runtime that is not a browser.                                                                                                |

`checkInterval` and `checkTimeout` take milliseconds or a time expression from `@sanely/duration`. The type checker checks a literal time expression and gives the reason for an invalid one. A string from config needs `isTimeExpression` from `@sanely/duration` first. `createDeploymentMonitor` throws `InvalidTimeExpressionError` for a string that is not a time expression.

## `DeploymentMonitor`

| Member                | Description                                                                                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getState()`          | Returns the current `DeploymentStatus`.                                                                                                                          |
| `subscribe(listener)` | Adds a listener and returns a function that removes it. The first subscriber starts the schedule. The last unsubscribe stops it and cancels a check in progress. |
| `check()`             | Starts a check, or joins the check in progress. Resolves with the new state. Never rejects.                                                                      |
| `reload()`            | Requests a reload through the reload guard.                                                                                                                      |

```ts
const unsubscribe = monitor.subscribe((state) => {
  if (state.status === "stale") showUpdateBanner(state.target.id)
})
```

## `DeploymentStatus`

| Field          | Type                                    | Description                                                                                                                                   |
| -------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `status`       | `"unknown" \| "current" \| "stale"`     | The result of the last successful check. `"unknown"` until the first check succeeds.                                                          |
| `checkStatus`  | `"checking" \| "idle"`                  | `"checking"` while a check is in progress. Otherwise `"idle"`.                                                                                |
| `error`        | `Error \| null`                         | The error from the last failed check. A successful check sets it to `null`.                                                                   |
| `running`      | `Deployment`                            | The running deployment.                                                                                                                       |
| `target`       | `Deployment \| null`                    | The target from the last successful check. `null` only when `status` is `"unknown"`.                                                          |
| `checkedAt`    | `Date \| null`                          | The time of the last successful check. `null` only when `status` is `"unknown"`.                                                              |
| `reloadStatus` | `"ready" \| "blocked" \| "unprotected"` | The state of the reload guard. See [the reload guard](../explanation/how-skew-detects-a-stale-client.md#the-reload-guard-stops-reload-loops). |
| `check`        | `() => Promise<DeploymentStatus>`       | The same as `DeploymentMonitor.check()`.                                                                                                      |
| `reload`       | `() => void`                            | The same as `DeploymentMonitor.reload()`.                                                                                                     |

`DeploymentStatus` is a discriminated union on `status`. When you check that `status` is not `"unknown"`, TypeScript narrows `target` to `Deployment` and `checkedAt` to `Date`.

A failed check changes only `checkStatus` and `error`. `status`, `target`, and `checkedAt` keep their last values.

## Targets

### `fetchDescriptor(url, init?)`

```ts
function fetchDescriptor(
  url: string,
  init?: Omit<RequestInit, "cache" | "signal"> & { fetch?: typeof fetch }
): TargetResolver
```

Returns a `TargetResolver` that fetches the descriptor from `url` and parses it. Each request sets `cache: "no-store"` and the monitor's abort signal. Use `init` for headers, credentials, and a custom `fetch`.

```ts
createDeploymentMonitor({
  target: fetchDescriptor("https://deployments.example.com/current.json", {
    credentials: "include",
  }),
})
```

The resolver throws a `TargetResolutionError` in these cases:

| Reason                                                 | Cause                                                            |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| `network`                                              | `fetch` threw for a reason other than an abort.                  |
| `http-status`                                          | The response status is not in the 200 to 299 range.              |
| `not-json`                                             | The `Content-Type` header is missing or does not contain `json`. |
| `invalid-json`, `unsupported-version`, `invalid-shape` | `parseDescriptor` rejected the body.                             |

### `TargetResolver`

```ts
type TargetResolver = (signal: AbortSignal) => Promise<Deployment>
```

Resolves the target deployment. It must reach a service that the running deployment does not control. Stop the work when `signal` aborts. A rejection becomes the state's `error`.

## Protocol

### `serializeDescriptor(deployment)`

Returns the descriptor JSON for `deployment`. See the [descriptor reference](./descriptor.md).

```ts
serializeDescriptor({ id: "abc123" }) // '{"v":1,"id":"abc123"}'
```

### `parseDescriptor(text)`

Parses descriptor JSON and returns a `Deployment`. Throws `TargetResolutionError` with reason `invalid-json`, `unsupported-version`, or `invalid-shape`.

```ts
parseDescriptor('{"v":1,"id":"abc123"}') // { id: "abc123" }
```

### `TargetResolutionError`

An `Error` with `name` set to `"TargetResolutionError"` and a `reason` of type `TargetResolutionErrorReason`. `cause` holds the original error, the `Response`, the text that failed to parse, or `{ checkTimeout }` for a timeout.

A check that takes longer than `checkTimeout` records a `TargetResolutionError` with reason `"timeout"`.

## Types

| Type                          | Description                                                                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Deployment`                  | `{ id: string; builtAt?: Date }`.                                                                                                                                         |
| `TargetResolutionErrorReason` | `"network" \| "http-status" \| "not-json" \| "invalid-json" \| "unsupported-version" \| "invalid-shape" \| "timeout"`.                                                    |
| `DescriptorV1`                | The descriptor wire format. See the [descriptor reference](./descriptor.md).                                                                                              |
| `RuntimeEnvironment`          | Timers, `addEventListener`, `removeEventListener`, `isVisible`, `now`, `reload`, and `storage`, which has the Web Storage methods `getItem`, `setItem`, and `removeItem`. |
