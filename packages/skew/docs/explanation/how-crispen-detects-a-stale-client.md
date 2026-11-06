# How Crispen detects a stale client

A browser tab can stay open for days. During that time you can deploy many times, and the tab keeps running the JavaScript it loaded first. Its API calls can then send requests that the new server no longer accepts, and its lazy chunks can point at files that the new deployment deleted. Crispen finds this skew between the client and the deployment. It reports the result, and your app decides what to do.

## Two identities: running and target

Crispen compares two deployments.

The **running deployment** is the build that produced the JavaScript in the tab. An adapter writes its ID into the page at build time as `globalThis.__CRISPEN__`, which is the **embed**. The running deployment never changes for the life of the page.

The **target deployment** is the build that the tab should use now. The adapter also writes it to a small JSON file, the **descriptor**, at `/_crispen/deployment.json`. A newer deployment replaces that file, so a fetch of the descriptor returns the new target. The runtime fetches the descriptor with `cache: "no-store"`.

If the two IDs are equal, the status is `current`. If they differ, the status is `stale`. You can replace the exact-ID comparison with an `isCurrent` predicate. For example, a predicate can treat two builds from one release branch as equal.

Crispen says "target" and not "latest" on purpose. During a canary release, tenant pinning, or a staged rollout, the newest global deployment may not be the one that this client should use. The descriptor answers "what should this client run", and the host decides that answer.

## The descriptor request must reach the live deployment

The descriptor request must not reach the old deployment. If the old deployment answers it, the client receives its own ID back and reports `current` forever.

Some hosts pin requests to one deployment. Vercel skew protection does this through the `__vdpl` cookie. If your app pins every request, point the adapter `endpoint` at an origin that is not pinned. Caches cause the same failure: a CDN that caches the descriptor returns an old target. For this reason, the descriptor response must carry `Cache-Control: no-store`. [How to stop hosts from caching the descriptor](../how-to/stop-hosts-from-caching-the-descriptor.md) gives the rule for each common host.

## Crispen never reloads by itself

A reload throws away form input, scroll position, and in-memory state. Only the app knows when a reload is safe. A user can be halfway through a checkout. So Crispen reports `stale` and gives you `reload()`. It never calls `reload()` for you.

This choice costs one component in your app, a notice or a banner. We think that cost is correct. An automatic reload that destroys a half-written message is a worse bug than a stale tab.

## The reload guard stops reload loops

A reload does not always reach the new deployment. A CDN can serve old HTML for a few minutes after a deploy. In that case, the page reloads, loads the old running deployment again, sees `stale` again, and the user clicks **Reload** again. Without a limit, the page loops.

`reload()` records each request in session storage under the key `crispen:reload`. The record holds the running ID, the target ID, an attempt count, and a time. Crispen counts a repeated request when the running ID and the target ID are the same as in the record and less than 10 minutes have passed. The guard allows the first request and one repeated request. It blocks the next repeated request and sets `reloadStatus` to `"blocked"`.

The block ends in three ways:

- If a later check finds a different target, `reloadStatus` returns to `"ready"`.
- If a page load starts on a different running deployment, the reload worked, and Crispen deletes the record.
- If `reload()` runs 10 minutes or more after the last request, Crispen starts a new sequence and reloads the page. A blocked request also updates the time in the record, so each request during the block starts the 10 minutes again.

A check that finds the same target does not end the block, even after 10 minutes. Keep the reload action visible in the blocked state, so the user can retry.

The guard uses session storage because a reload sequence belongs to one tab. Local storage is shared between tabs, so one tab could block a valid reload in another tab. If session storage is unavailable or throws, `reloadStatus` is `"unprotected"`. `reload()` then reloads the page without the guard.

## Status is durable, and the other fields are not

`DeploymentStatus` keeps four kinds of state in separate fields:

- `status` (`"unknown"`, `"current"`, or `"stale"`) is the result of the last successful check.
- `checkStatus` (`"checking"` or `"idle"`) shows whether a check is in progress.
- `error` holds the error from the last check that failed.
- `reloadStatus` (`"ready"`, `"blocked"`, or `"unprotected"`) shows the state of the reload guard.

A failed check or a new check does not change `status`. When a tab knows that it is stale and the network then goes down, it stays `stale`. Its last `target` and `checkedAt` stay too. `check()` never rejects. It writes the failure to `error` and resolves with the full state.

## One shared monitor serves all subscribers

The **monitor** is the headless runtime. It schedules checks, runs them, and holds the state. Crispen keeps one monitor for each `DeploymentSource` object, so ten components that use `useDeploymentStatus()` send one request, not ten. There is no provider component.

The first subscriber starts the schedule. The last subscriber to leave stops it and cancels a check that is in progress. When subscribers ask for different options, the monitor combines them:

- The shortest `checkInterval` applies.
- A trigger is on if any subscriber turns it on.
- The `isCurrent` predicate of the earliest active subscriber that set one applies, and all subscribers see the same result.

## Checks follow the user's attention

A check runs at these times:

- when the first subscriber attaches (`checkOnSubscribe`),
- when the tab becomes visible, or when the browser restores the page from the back-forward cache (`checkOnVisible`),
- when the browser comes back online (`checkOnReconnect`),
- on an interval (`checkInterval`, 5 minutes by default, 10 seconds at least).

The interval pauses while the tab is hidden. A hidden tab cannot show a notice, so a check there wastes a request. Crispen listens to `visibilitychange` and not to `focus`. The browser also fires `focus` when the user comes back from another window while the page was visible the whole time, so a `focus` check adds a request and no information.

A check that takes longer than 30 seconds stops and records a timeout error. A monitor that you create with `createDeploymentMonitor` can change this limit through `checkTimeout`.

## Development builds stay inert

The adapters do nothing in `vite dev` and `next dev`. A development server has no deployment to compare. Without an embed, the monitor reports `unknown`, never checks, and logs one warning in development. To see the `stale` state of your notice before you deploy, use a static source. [How to preview the update notice in development](../how-to/preview-the-update-notice.md) shows how.

## Adapters and integrations stay independent

An **adapter** (`@sanely/skew/vite`, `@sanely/skew/next`) works at build time. It writes the embed and serves the descriptor. An **integration** (`@sanely/skew/react`) works in the browser. It gives the monitor state to a UI library.

The embed and the descriptor are the only connection between the two. So the React integration works the same with the Vite adapter and with the Next.js adapter, and a new adapter needs no change to any integration. The descriptor has a version field for this reason. An old tab that stays open for a week must still read a descriptor that a newer adapter wrote.
