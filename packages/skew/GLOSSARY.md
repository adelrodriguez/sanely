# `@sanely/skew` glossary

`@sanely/skew` detects skew between a running browser client and the deployment that the client should use. Use these terms, with these meanings, in code, tests, issues, and docs.

## Word rules

Each word below belongs to one kind of text. Use it only there.

| Word                  | Use it in                                   | Do not use it in |
| --------------------- | ------------------------------------------- | ---------------- |
| "skew"                | Prose: problem statements, docs, README.    | Code.            |
| "current" and "stale" | Code: status values and identifiers.        | Brand copy.      |
| "fresh"               | Brand copy: the tagline and marketing text. | Code and specs.  |

## Packages

**Core.** The `@sanely/skew` root export. It holds the protocol and the headless runtime. Its only runtime dependency is `@sanely/duration`, which reads time expressions.

**Adapter.** A build-tool or framework package: `@sanely/skew/vite` or `@sanely/skew/next`. An adapter writes the embed into the built app and makes the descriptor available. Adapters can use any mechanism of their framework, but every adapter must give the same runtime result. Do not call an adapter a "producer".

**Integration.** A UI library package: `@sanely/skew/react`. An integration gives monitor state to the library through its own primitives, such as hooks. An integration never depends on one adapter. Do not call an integration a "consumer adapter".

**Package consumer.** An app that installs `@sanely/skew`.

## Deployments

**Deployment.** One identified build of the app: `{ id: string, builtAt?: Date }`.

**Running deployment.** The deployment that produced the JavaScript in this tab. It never changes for the life of the page.

**Target deployment.** The deployment that this tab should use now. Do not call it the "latest" deployment. During a canary release, tenant pinning, or a staged rollout, the newest global deployment can differ from this tab's target.

**Deployment ID strategy.** The adapter rule that selects the running deployment ID: a literal string, a named platform, one or more environment variables, or a function. Without a strategy, the adapter detects the platform. See the [adapters reference](docs/reference/adapters.md#deployment-id).

## Protocol

**Descriptor.** The JSON file that holds the target deployment, at `/_deployment-check/deployment.json` by default. It has a version field (`v: 1`). The descriptor format must stay readable by old clients, because a tab that stays open for a week reads descriptors from newer adapters.

**Embed.** The value that the adapter writes into the page as `globalThis.__DEPLOYMENT_CHECK__`. It holds the running deployment, the descriptor endpoint, and the load error event. The core reads the running deployment from the embed and does not know which adapter wrote it.

**Load error event.** A `window` event that the build fires when it fails to load code, such as Vite's `vite:preloadError`. An adapter names it in the embed, and the monitor checks when it fires. The core never names an event itself.

**Endpoint.** The URL of the descriptor. A **local endpoint** is a path on the app origin, and the adapter writes the descriptor for it. An **external endpoint** is an absolute or protocol-relative URL, and another service serves the descriptor.

**Target resolver.** The function that finds the target deployment for a check. It must reach a service that the running deployment does not control. By default, it fetches the descriptor from the endpoint in the embed. Do not call it a "source".

## Runtime

**Monitor** (`DeploymentMonitor`). The headless runtime. It schedules checks, runs them, holds the state, and has `check()` and `reload()`. A monitor owns its whole configuration: the running deployment, the target resolver, the schedule, and `isCurrent`. A page uses one monitor. Components subscribe to it. They do not configure it or own it, and no provider component exists.

**Default monitor.** The monitor that the React hook uses when it gets none. It reads the embed, and no caller can reach it.

**Subscriber.** A listener on a monitor. The first subscriber starts the monitor's schedule, and the last one to leave stops it. A subscriber has no options.

**Check.** One resolution of the target and one `isCurrent` comparison. A check never rejects. A failure goes into `error`.

**`isCurrent`.** An optional pure function `(running, target) => boolean`. Without it, the comparison is exact ID equality.

**`DeploymentStatus`.** The state that subscribers receive. `status` (`"unknown"`, `"current"`, or `"stale"`) is durable: only a successful check changes it. `checkStatus`, `reloadStatus`, and `error` are separate fields, and a change to them never changes `status`. When `status` is `"current"` or `"stale"`, `target` and `checkedAt` are not `null`.

**Reload guard.** The part of `reload()` that stops reload loops. It records each reload request in session storage and blocks a request after two reloads that land on the same running deployment. `reloadStatus` is `"unprotected"` when session storage is unavailable or throws.

**Inert.** The state of a monitor with no running deployment, for example in development. An inert monitor reports `"unknown"` and never checks.
