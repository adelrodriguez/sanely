# @sanely/skew

## 0.1.0

### Minor Changes

- b524662: Check for a new deployment as soon as a lazy chunk fails to load in a Vite build

  A tab that runs an old deployment can ask for a chunk that the new deployment deleted. The tab used to learn that it was stale only at the next scheduled check, up to 5 minutes later. The Vite adapter now names Vite's `vite:preloadError` event in the embed, and the monitor checks when that event fires, so the update notice appears right after the failed load. The monitor never cancels the event, so the failed import still rejects.

  Vite fires the event only for a dynamic import that has CSS or shared chunks to preload. Turn the trigger off with `createDeploymentMonitor({ checkOnLoadError: false })`. The Next.js adapter is unchanged.

- 53a3e7c: Reject a `checkTimeout` or `checkInterval` that no timer can wait for

  `0`, a negative or fractional number, `NaN`, `Infinity`, and any length above 2147483647 ms, such as `"30d"`, made every check time out after 1 ms or made the monitor poll in a tight loop. `createDeploymentMonitor` now throws `InvalidOptionError`, with the `option` and the `value`, for these values and for a string that is not a time expression. A `checkInterval` from 1 to 9999 ms still rises to 10000 ms with a warning.

- b385363: Configure one monitor with `createDeploymentMonitor(options)`, and pass it to `useDeploymentStatus(monitor)`

  A source created during render made a new shared monitor and a new request on every render, any caller could destroy a shared monitor that other components still read, and subscribers with different `isCurrent` comparisons silently shared the first one. The monitor now owns its whole configuration, so none of these can happen.

  - `createDeploymentMonitor(options?)` reads the running deployment and the endpoint from the embed. `target` takes a descriptor URL or a function that returns a `Deployment`, and `running` overrides the embed for a preview or a test. `checkInterval`, `checkOnReconnect`, `checkOnSubscribe`, `checkOnVisible`, and `isCurrent` move from the subscriber to the monitor.
  - `useDeploymentStatus(monitor?)` takes a monitor instead of options. Without one, it uses a monitor that reads the embed.
  - `fetchDescriptor(url, init?)` replaces `createHttpSource(running, url, init?)`. `{ running, target: () => Promise.resolve(target) }` replaces `createStaticSource(running, target)`.
  - A monitor has no `destroy()`. The last unsubscribe stops its schedule and cancels a check in progress.
  - A check that times out records a `TargetResolutionError` with reason `"timeout"`, and its `cause` holds `{ checkTimeout }`.
  - The root no longer exports `getMonitor`, `getDefaultMonitor`, `createHttpSource`, `createEmbeddedSource`, `createStaticSource`, `readEmbed`, `DEFAULT_CHECK_TIMEOUT`, `DEFAULT_DESCRIPTOR_ENDPOINT`, `DeploymentSource`, `DeploymentSubscriberOptions`, `HttpSourceInit`, `DeploymentEmbed`, `IsDeploymentCurrent`, `CheckStatus`, `ReloadStatus`, `RuntimeEvent`, `RuntimeEventType`, `RuntimeStorage`, or `TimerHandle`. `@sanely/skew/react` no longer exports `DeploymentStatusOptions`.

- 9bb9195: Accept time expressions such as `"5m"` for `checkInterval` and `checkTimeout`

  `createDeploymentMonitor({ checkInterval: "5m", checkTimeout: "10s" })` is the same as `checkInterval: 300_000, checkTimeout: 10_000`. The type checker checks a literal expression with `@sanely/duration`, so `"1M"` fails to compile with the reason. A string from config needs `isTimeExpression` from `@sanely/duration` first.

  `@sanely/skew` now depends on `@sanely/duration`.

### Patch Changes

- 5dd883e: Serve a local endpoint that has a query string, such as `/descriptor.json?tenant=a`

  The Vite adapter wrote the descriptor to a file named `descriptor.json?tenant=a`, so a request for the endpoint found no file. The Next.js adapter put the query string in its `headers()` rule, and Next.js rejected the config. Both adapters now drop the query string and the fragment when they choose where to serve the descriptor, and the embed keeps the endpoint as you wrote it.

- 2bc199c: Count several `reload()` calls in one page as one reload, and start the cooldown at the last reload

  The reload guard counted every `reload()` call. A user who clicked **Reload** three times before the page unloaded blocked the guard after two reloads that never landed, so the next click did nothing. The guard now records one request for each page load and target, and all monitors on a page share these records. Further calls for a recorded target reload the page without counting again, even after the target changes and changes back.

  A blocked `reload()` also restarted the 10-minute cooldown, so a user who kept clicking **Reload** stayed blocked. A blocked request now leaves the record unchanged, and the cooldown runs from the last reload.

- Updated dependencies [a72bd6a]
- Updated dependencies [a72bd6a]
- Updated dependencies [e6ab5a0]
- Updated dependencies [a72bd6a]
- Updated dependencies [a72bd6a]
  - @sanely/duration@0.1.0
