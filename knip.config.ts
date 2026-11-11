import type { KnipConfig } from "knip"
import analyze, { ignoreDependencies } from "adamantite/analyze"

export default {
  ...analyze,
  // Agents run `pnpm packref` from the shell, as docs/agents/tooling.md says. No script or source
  // file names it, so Knip reports it as an unused devDependency.
  ignoreDependencies: [...ignoreDependencies.monorepo, "packref"],
  workspaces: {
    ".": {
      entry: ["scripts/*.{mjs,ts}", ".adamantite/lint/__tests__/*.test.ts"],
      project: ["scripts/**/*.{mjs,ts}", "turbo/generators/**/*.ts", ".adamantite/lint/**/*.ts"],
    },
    "packages/*": {
      entry: ["src/**/*.test-d.{ts,tsx}", "scripts/*.{mjs,ts}"],
      project: ["src/**/*.{ts,tsx}", "scripts/**/*.{mjs,ts}"],
    },
    // The Durable Object tests run in Workers that `wrangler.jsonc` files name as `main`, through
    // @cloudflare/vitest-plugin. Knip's Wrangler plugin resolves `main` from the workspace instead of
    // the configuration file (webpro-nl/knip#2343), so the Workers are listed here. Replace them with
    // `wrangler: { config: [...] }` once a Knip release fixes that issue.
    "packages/ratelimit": {
      entry: [
        "src/**/*.test-d.{ts,tsx}",
        "scripts/*.{mjs,ts}",
        "src/lib/stores/durable-object/__tests__/worker.ts",
        "scripts/compat/workerd/worker.mjs",
      ],
      project: ["src/**/*.{ts,tsx}", "scripts/**/*.{mjs,ts}"],
    },
  },
} satisfies KnipConfig
