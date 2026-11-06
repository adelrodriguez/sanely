# How to preview the update notice in development

The adapters do nothing in `vite dev` and `next dev`, so your update notice never appears there. To see it, give the hook a static source in development.

1. Create the source at module scope, so that all renders share one monitor:

   ```tsx
   import { createStaticSource } from "@sanely/skew"
   import { useDeploymentStatus } from "@sanely/skew/react"

   const developmentSource = import.meta.env.DEV
     ? createStaticSource({ id: "dev-running" }, { id: "dev-target" })
     : undefined

   export function UpdateNotice() {
     const deployment = useDeploymentStatus({ source: developmentSource })

     if (deployment.status !== "stale") {
       return null
     }

     return <p>A new version is available.</p>
   }
   ```

   In Next.js, replace `import.meta.env.DEV` with `process.env.NODE_ENV === "development"`.

2. Start the development server. The notice appears after the first check, because the two IDs are different.

3. To see the `current` state, give both arguments the same ID:

   ```ts
   createStaticSource({ id: "dev" }, { id: "dev" })
   ```

In a production build, `developmentSource` is `undefined`, and the hook uses the embed.

Each `reload()` in development reloads the page, and the page shows `stale` again. The reload guard allows two reloads and blocks the third, so `reloadStatus` becomes `"blocked"`. Use this to check how your notice shows the blocked state.
