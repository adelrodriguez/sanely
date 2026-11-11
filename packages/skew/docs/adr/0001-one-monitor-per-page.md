# One monitor per page owns its configuration

A page runs one deployment, so `@sanely/skew` gives it one monitor that owns the running deployment, the target resolver, the schedule, and `isCurrent`. Components pass that monitor to `useDeploymentStatus(monitor?)` and cannot configure it, and a monitor has no `destroy()`: the last unsubscribe stops it. We chose this after three footguns in the earlier design, where the hook found a shared monitor by its source object and merged each subscriber's options. A source created during render looped forever, any caller could destroy a monitor that other components still read, and subscribers with different `isCurrent` comparisons silently shared the first one.

## Considered options

- **Keep shared monitors, but key them by a `key` on each source and remove `destroy()` from the shared type.** This fixed the loop and the destroy, but it kept three ways to get a monitor, the merged subscriber options, and a running ID that every custom source had to restate.
- **An event API, `watchDeployment({ onStale })`, with a hook that returns only the stale target.** The common call was shortest, but a "check now" button or a status page needs `unknown`, `current`, and `checking`, so the package would need a second, fuller API.

## Consequences

- A component cannot ask for its own `checkInterval` or `isCurrent`. A page that needs a second schedule creates a second monitor, which sends its own requests.
- Two calls to `createDeploymentMonitor()` make two independent monitors. Create a monitor once, at module scope. A monitor created during render is a new monitor on every render.
