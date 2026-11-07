# How to add `@sanely/skew` to a Next.js app

This guide adds an update notice to a Next.js app. The notice appears when a newer deployment is live. It works with the App Router and the Pages Router.

1. Install the package:

   ```sh
   npm install @sanely/skew
   ```

2. Wrap your config in `next.config.ts`:

   ```ts
   import { withDeploymentCheck } from "@sanely/skew/next"

   export default withDeploymentCheck({
     // Your Next.js config.
   })
   ```

3. Add the embed and the descriptor route for your router.

   For the App Router, render `DeploymentScript` in `app/layout.tsx`:

   ```tsx
   import { DeploymentScript } from "@sanely/skew/next"

   export default function RootLayout({ children }: { children: React.ReactNode }) {
     return (
       <html lang="en">
         <body>
           <DeploymentScript />
           {children}
         </body>
       </html>
     )
   }
   ```

   Then create `app/%5Fdeployment-check/deployment.json/route.ts`:

   ```ts
   export { GET } from "@sanely/skew/next"
   ```

   The folder name starts with `%5F`, the encoded `_`, because Next.js treats an `app` folder that starts with `_` as private.

   For the Pages Router, the Pages Router runs API handlers only from `pages/api`. Set `endpoint` in `next.config.ts` to the handler's path:

   ```ts
   export default withDeploymentCheck(
     {
       // Your Next.js config.
     },
     { endpoint: "/api/deployment-check/deployment.json" }
   )
   ```

   Then create `pages/api/deployment-check/deployment.json.ts`:

   ```ts
   export { descriptorHandler as default } from "@sanely/skew/next"
   ```

   Call `DeploymentScript` in the `<body>` of `pages/_document.tsx`:

   ```tsx
   import { DeploymentScript } from "@sanely/skew/next"
   import { Head, Html, Main, NextScript } from "next/document"

   export default function Document() {
     return (
       <Html lang="en">
         <Head />
         <body>
           {DeploymentScript()}
           <Main />
           <NextScript />
         </body>
       </Html>
     )
   }
   ```

   Write `{DeploymentScript()}`, not `<DeploymentScript />`. Next.js finds a `beforeInteractive` script in `_document` only when the `<Script>` element is there directly.

4. Add the `UpdateNotice` component from [How to add `@sanely/skew` to a Vite app](./add-skew-to-a-vite-app.md), step 3. Add `"use client"` at the top of its file.

5. Run `next build` and `next start`. Make sure that the descriptor returns JSON with an `id`: `/_deployment-check/deployment.json` for the App Router, or `/api/deployment-check/deployment.json` for the Pages Router.

The adapter detects the deployment ID on Vercel, Cloudflare Pages, Netlify, and GitHub Actions. On another host, see [How to set the deployment ID](./set-the-deployment-id.md).

## If you use `output: "export"`

Add this line to the App Router route file, so that Next.js writes the descriptor as a static file:

```ts
export const dynamic = "force-static"
```

Next.js does not apply `headers()` rules to a static export. Add the cache rule on your host. See [How to stop hosts from caching the descriptor](./stop-hosts-from-caching-the-descriptor.md).

## If you deploy to Vercel with skew protection

Vercel skew protection does not pin a `fetch` from client code by default, so the descriptor request reaches the live deployment. If your app sets the `__vdpl` cookie, Vercel pins every request, and the old deployment answers the descriptor request. In that case, do one of these:

- Set `endpoint` to an origin that Vercel does not pin.
- Exclude the descriptor path, such as `/_deployment-check/deployment.json`, from the cookie.

[The descriptor request must reach the live deployment](../explanation/how-skew-detects-a-stale-client.md#the-descriptor-request-must-reach-the-live-deployment) explains why.
