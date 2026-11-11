---
"@sanely/skew": minor
---

Check for a new deployment as soon as a lazy chunk fails to load in a Vite build

A tab that runs an old deployment can ask for a chunk that the new deployment deleted. The tab used to learn that it was stale only at the next scheduled check, up to 5 minutes later. The Vite adapter now names Vite's `vite:preloadError` event in the embed, and the monitor checks when that event fires, so the update notice appears right after the failed load. The monitor never cancels the event, so the failed import still rejects.

Vite fires the event only for a dynamic import that has CSS or shared chunks to preload. Turn the trigger off with `createDeploymentMonitor({ checkOnLoadError: false })`. The Next.js adapter is unchanged.
