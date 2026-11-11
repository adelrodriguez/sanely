---
"@sanely/skew": minor
---

Configure one monitor with `createDeploymentMonitor(options)`, and pass it to `useDeploymentStatus(monitor)`

A source created during render made a new shared monitor and a new request on every render, any caller could destroy a shared monitor that other components still read, and subscribers with different `isCurrent` comparisons silently shared the first one. The monitor now owns its whole configuration, so none of these can happen.

- `createDeploymentMonitor(options?)` reads the running deployment and the endpoint from the embed. `target` takes a descriptor URL or a function that returns a `Deployment`, and `running` overrides the embed for a preview or a test. `checkInterval`, `checkOnReconnect`, `checkOnSubscribe`, `checkOnVisible`, and `isCurrent` move from the subscriber to the monitor.
- `useDeploymentStatus(monitor?)` takes a monitor instead of options. Without one, it uses a monitor that reads the embed.
- `fetchDescriptor(url, init?)` replaces `createHttpSource(running, url, init?)`. `{ running, target: () => Promise.resolve(target) }` replaces `createStaticSource(running, target)`.
- A monitor has no `destroy()`. The last unsubscribe stops its schedule and cancels a check in progress.
- A check that times out records a `TargetResolutionError` with reason `"timeout"`, and its `cause` holds `{ checkTimeout }`.
- The root no longer exports `getMonitor`, `getDefaultMonitor`, `createHttpSource`, `createEmbeddedSource`, `createStaticSource`, `readEmbed`, `DEFAULT_CHECK_TIMEOUT`, `DEFAULT_DESCRIPTOR_ENDPOINT`, `DeploymentSource`, `DeploymentSubscriberOptions`, `HttpSourceInit`, `DeploymentEmbed`, `IsDeploymentCurrent`, `CheckStatus`, `ReloadStatus`, `RuntimeEvent`, `RuntimeEventType`, `RuntimeStorage`, or `TimerHandle`. `@sanely/skew/react` no longer exports `DeploymentStatusOptions`.
