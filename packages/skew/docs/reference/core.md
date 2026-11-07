# `@sanely/skew` reference

The core package: the protocol and the headless runtime. It has no runtime dependencies and does not import React or an adapter.

## Monitors

### `createDeploymentMonitor(source?, options?)`

```ts
function createDeploymentMonitor(
  source?: DeploymentSource,
  options?: DeploymentMonitorOptions
): DeploymentMonitor
```

Creates an independent monitor. The registry does not hold it, so `getMonitor` and the React hook never return it. Without `source`, the monitor is inert: its status stays `"unknown"` and it never checks.

`DeploymentMonitorOptions`:

| Option         | Type                  | Default                   | Description                                                                                     |
| -------------- | --------------------- | ------------------------- | ----------------------------------------------------------------------------------------------- |
| `checkTimeout` | `number`              | `DEFAULT_CHECK_TIMEOUT`   | Milliseconds before a check stops with a timeout error. Must be finite. You cannot turn it off. |
| `environment`  | `RuntimeEnvironment`  | The browser environment   | Timers, events, storage, and reload. Replace it in tests or in a runtime that is not a browser. |
| `isCurrent`    | `IsDeploymentCurrent` | Exact deployment ID match | The comparison that applies when no subscriber sets `isCurrent`.                                |

### `getDefaultMonitor()`

```ts
function getDefaultMonitor(): DeploymentMonitor
```

Returns the shared monitor for the embed. The registry creates it on the first call. If the page has no valid embed, the monitor is inert and logs one warning outside production.

### `getMonitor(source)`

```ts
function getMonitor(source: DeploymentSource): DeploymentMonitor
```

Returns the shared monitor for `source`. Each source object has one monitor. After you call `destroy()` on it, the next call returns a new monitor.

### `DEFAULT_CHECK_TIMEOUT`

`30000`. The default value of `checkTimeout`, in milliseconds.

## `DeploymentMonitor`

| Member                          | Description                                                                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `getState()`                    | Returns the current `DeploymentStatus`.                                                                                                       |
| `subscribe(listener, options?)` | Adds a listener and returns a function that removes it. `options` is a `DeploymentSubscriberOptions`.                                         |
| `check()`                       | Starts a check, or joins the check in progress. Resolves with the new state. Never rejects.                                                   |
| `reload()`                      | Requests a reload through the reload guard.                                                                                                   |
| `destroy()`                     | Stops the schedule, cancels a check in progress, and removes all listeners. After `destroy()`, `subscribe`, `check`, and `reload` do nothing. |

`DeploymentSubscriberOptions` has `checkInterval`, `checkOnReconnect`, `checkOnSubscribe`, `checkOnVisible`, and `isCurrent`. The [React reference](./react.md#options) gives their types and defaults.

## `DeploymentStatus`

| Field          | Type                                | Description                                                                                                                                                |
| -------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status`       | `"unknown" \| "current" \| "stale"` | The result of the last successful check. `"unknown"` until the first check succeeds.                                                                       |
| `checkStatus`  | `CheckStatus`                       | `"checking"` while a check is in progress. Otherwise `"idle"`.                                                                                             |
| `error`        | `Error \| null`                     | The error from the last failed check. A successful check sets it to `null`.                                                                                |
| `running`      | `Deployment`                        | The running deployment.                                                                                                                                    |
| `target`       | `Deployment \| null`                | The target from the last successful check. `null` only when `status` is `"unknown"`.                                                                       |
| `checkedAt`    | `Date \| null`                      | The time of the last successful check. `null` only when `status` is `"unknown"`.                                                                           |
| `reloadStatus` | `ReloadStatus`                      | `"ready"`, `"blocked"`, or `"unprotected"`. See [the reload guard](../explanation/how-skew-detects-a-stale-client.md#the-reload-guard-stops-reload-loops). |
| `check`        | `() => Promise<DeploymentStatus>`   | The same as `DeploymentMonitor.check()`.                                                                                                                   |
| `reload`       | `() => void`                        | The same as `DeploymentMonitor.reload()`.                                                                                                                  |

`DeploymentStatus` is a discriminated union on `status`. When you check that `status` is not `"unknown"`, TypeScript narrows `target` to `Deployment` and `checkedAt` to `Date`.

A failed check changes only `checkStatus` and `error`. `status`, `target`, and `checkedAt` keep their last values.

## Sources

### `createHttpSource(running, endpoint, init?)`

```ts
function createHttpSource(
  running: Deployment,
  endpoint: string,
  init?: HttpSourceInit
): DeploymentSource
```

Creates a source that fetches the descriptor from `endpoint` and parses it.

`HttpSourceInit` is `RequestInit` without `cache` and `signal`, plus an optional `fetch` function. The source always sets `cache: "no-store"` and its own abort signal. Use `init` for headers, credentials, and a custom `fetch`.

The source throws a `TargetResolutionError` in these cases:

| Reason                                                 | Cause                                                            |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| `network`                                              | `fetch` threw for a reason other than an abort.                  |
| `http-status`                                          | The response status is not in the 200 to 299 range.              |
| `not-json`                                             | The `Content-Type` header is missing or does not contain `json`. |
| `invalid-json`, `unsupported-version`, `invalid-shape` | `parseDescriptor` rejected the body.                             |

### `createEmbeddedSource()`

```ts
function createEmbeddedSource(): DeploymentSource | undefined
```

Reads the embed and returns an HTTP source for its running deployment and endpoint. The endpoint is `DEFAULT_DESCRIPTOR_ENDPOINT` when the embed has none. Returns `undefined` when the page has no valid embed.

### `createStaticSource(running, target)`

```ts
function createStaticSource(running: Deployment, target: Deployment): DeploymentSource
```

Creates a source that always resolves to `target`. Use it in development, previews, and tests.

### `DeploymentSource`

```ts
interface DeploymentSource {
  readonly running: Deployment
  resolveTarget(signal: AbortSignal): Promise<Deployment>
}
```

The contract between a source and the monitor. `resolveTarget` must reach a service that the running deployment does not control. Stop the work when `signal` aborts.

## Protocol

### `serializeDescriptor(deployment)`

Returns the descriptor JSON for `deployment`. See the [descriptor reference](./descriptor.md).

### `parseDescriptor(text)`

Parses descriptor JSON and returns a `Deployment`. Throws `TargetResolutionError` with reason `invalid-json`, `unsupported-version`, or `invalid-shape`.

### `readEmbed()`

Returns the embed from `globalThis.__DEPLOYMENT_CHECK__`, or `undefined` if the embed is missing or malformed. Logs a warning for a malformed embed outside production.

### `DEFAULT_DESCRIPTOR_ENDPOINT`

`"/_deployment-check/deployment.json"`.

### `TargetResolutionError`

An `Error` with `name` set to `"TargetResolutionError"` and a `reason` of type `TargetResolutionErrorReason`. `cause` holds the original error, the `Response`, or the text that failed to parse.

## Types

| Type                          | Description                                                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `Deployment`                  | `{ id: string; builtAt?: Date }`.                                                                                      |
| `IsDeploymentCurrent`         | `(running: Deployment, target: Deployment) => boolean`. Must be pure.                                                  |
| `CheckStatus`                 | `"checking" \| "idle"`.                                                                                                |
| `ReloadStatus`                | `"blocked" \| "ready" \| "unprotected"`.                                                                               |
| `TargetResolutionErrorReason` | `"network" \| "http-status" \| "not-json" \| "invalid-json" \| "unsupported-version" \| "invalid-shape"`.              |
| `DescriptorV1`                | The descriptor wire format. See the [descriptor reference](./descriptor.md).                                           |
| `DeploymentEmbed`             | The embed format. See the [descriptor reference](./descriptor.md#embed).                                               |
| `RuntimeEnvironment`          | Timers that use `TimerHandle`, `addEventListener`, `removeEventListener`, `isVisible`, `now`, `reload`, and `storage`. |
| `RuntimeEvent`                | `{ persisted?: boolean }`.                                                                                             |
| `RuntimeEventType`            | `"online" \| "pageshow" \| "visibilitychange"`.                                                                        |
| `RuntimeStorage`              | `getItem`, `setItem`, and `removeItem`, with the same signatures as Web Storage.                                       |
| `TimerHandle`                 | `number \| ReturnType<typeof setTimeout>`. The value that the environment timers return and clear.                     |
