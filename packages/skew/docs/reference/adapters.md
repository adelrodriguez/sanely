# Adapters reference

An adapter runs at build time. It writes the embed into the page and makes the descriptor available. Both adapters accept the same options and resolve the deployment ID the same way. In development (`vite dev` and `next dev`), both adapters do nothing.

## Options

| Option         | Type                 | Default                     | Description                               |
| -------------- | -------------------- | --------------------------- | ----------------------------------------- |
| `deploymentId` | `DeploymentIdOption` | Detected. See below.        | The running deployment ID for this build. |
| `endpoint`     | `string`             | `/_crispen/deployment.json` | The descriptor URL.                       |

## Deployment ID

`DeploymentIdOption` is one of these values:

| Value                                  | Result                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------- |
| A non-empty string                     | That string.                                                                        |
| `{ platform: DeploymentPlatform }`     | The commit SHA variable of that platform. The adapter does not detect the platform. |
| `{ env: string \| readonly string[] }` | The first non-empty variable from the list, in list order.                          |
| `() => string \| undefined`            | The return value of the function.                                                   |
| Not set, or an empty string            | Detected. See the next section.                                                     |

If a platform, `env`, or function strategy returns nothing, the adapter logs a warning in the build output and uses a random ID. An explicit strategy never falls back to detection or to `GIT_SHA`.

### Detection

Without an explicit strategy, the adapter checks for each platform in this order and uses the first one it finds:

| Platform         | `DeploymentPlatform` | Detected when         | Reads                   |
| ---------------- | -------------------- | --------------------- | ----------------------- |
| Vercel           | `"vercel"`           | `VERCEL=1`            | `VERCEL_GIT_COMMIT_SHA` |
| Cloudflare Pages | `"cloudflare-pages"` | `CF_PAGES=1`          | `CF_PAGES_COMMIT_SHA`   |
| Netlify          | `"netlify"`          | `NETLIFY=true`        | `COMMIT_REF`            |
| GitHub Actions   | `"github-actions"`   | `GITHUB_ACTIONS=true` | `GITHUB_SHA`            |

The adapter reads only the variable of the detected platform. A `GITHUB_SHA` that leaks into a Vercel build does not apply. If the variable is empty, or if no platform matches, the adapter reads `GIT_SHA`. If `GIT_SHA` is empty, the adapter uses a random ID.

A random ID is different on every build. Two builds of the same commit then have different deployment IDs.

## Endpoint

An endpoint is **external** when it is an absolute URL (`https://...`) or a protocol-relative URL (`//...`). Any other endpoint is **local**.

- An external endpoint goes into the embed unchanged. The adapter does not write a descriptor, and your service must serve one.
- A local endpoint is relative to the base path of the app. The adapter adds the base path in front of it and writes a descriptor for it.

## `@sanely/skew/vite`

```ts
function crispen(options?: CrispenViteOptions): Plugin
```

A Vite plugin that runs only in `vite build`. Put it after the framework plugin. It needs `vite` 5 or later.

- It adds the embed as the first `<script>` in `<head>` of each HTML page.
- For a local endpoint, it writes the descriptor as a file in the build output. The path is the endpoint without its leading `/`.
- It adds Vite `base` in front of a local endpoint when `base` starts with `/`. When `base` is relative (`./`) or a full URL, the endpoint stays an absolute path on the application origin.

The descriptor file is static. Your host decides its headers. See [How to stop hosts from caching the descriptor](../how-to/stop-hosts-from-caching-the-descriptor.md).

Exported types: `CrispenViteOptions`, `DeploymentIdOption`, and `DeploymentPlatform`.

## `@sanely/skew/next`

It needs `next` 15 or later. It supports the App Router and the Pages Router.

### `withCrispen(config?, options?)`

```ts
function withCrispen(config?: NextConfigExport, options?: CrispenNextOptions): NextConfigFunction
```

Wraps a Next.js config object or config function.

- It keeps every value of your config.
- It adds two values to `env`, `CRISPEN_NEXT_EMBED` and `CRISPEN_NEXT_DESCRIPTOR`. Both are empty in `next dev`.
- For a local endpoint, it adds a `headers()` rule that sets `Cache-Control: no-store` on the endpoint. It keeps your own `headers()` rules first.
- It adds `basePath` in front of a local endpoint.
- If `options.deploymentId` is not set, it uses the Next.js `deploymentId` config value as the strategy. It never sets the Next.js `deploymentId`, because that value controls host skew protection.

Next.js does not apply `headers()` rules with `output: "export"`. Add the cache rule on your host.

### `CrispenScript`

A component that writes the embed with `next/script` and `strategy="beforeInteractive"`. It renders nothing in `next dev`. Put it in the root layout (App Router) or in `pages/_document` (Pages Router).

### `GET`

An App Router route handler that returns the descriptor with `Cache-Control: no-store` and `Content-Type: application/json; charset=utf-8`. It returns status `404` when the descriptor is empty, for example in `next dev`.

### `crispenPagesHandler`

A Pages Router API handler with the same response as `GET`.

Exported types: `CrispenNextOptions`, `DeploymentIdOption`, `DeploymentPlatform`, `NextConfigContext`, `NextConfigExport`, and `NextConfigFunction`.
