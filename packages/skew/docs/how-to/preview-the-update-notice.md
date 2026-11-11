# How to preview the update notice in development

The adapters do nothing in `vite dev` and `next dev`, so your update notice never appears there. To see it, give the hook a monitor with a fixed running deployment and target in development.

1. Create a monitor at module scope. In development, give it a running deployment and a target with different IDs:

   ```tsx
   import { createDeploymentMonitor } from "@sanely/skew"
   import { useDeploymentStatus } from "@sanely/skew/react"

   const monitor = createDeploymentMonitor(
     import.meta.env.DEV
       ? { running: { id: "dev-running" }, target: () => Promise.resolve({ id: "dev-target" }) }
       : {}
   )

   export function UpdateNotice() {
     const deployment = useDeploymentStatus(monitor)

     if (deployment.status !== "stale") {
       return null
     }

     return <p>A new version is available.</p>
   }
   ```

   In Next.js, replace `import.meta.env.DEV` with `process.env.NODE_ENV === "development"`.

2. Start the development server. The notice appears after the first check, because the two IDs are different.

3. To see the `current` state, give the target the running ID:

   ```ts
   createDeploymentMonitor(
     import.meta.env.DEV
       ? { running: { id: "dev" }, target: () => Promise.resolve({ id: "dev" }) }
       : {}
   )
   ```

In a production build, the monitor gets no options and reads the embed.

Each `reload()` in development reloads the page, and the page shows `stale` again. The reload guard allows two reloads and blocks the third, so `reloadStatus` becomes `"blocked"`. Use this to check how your notice shows the blocked state.
