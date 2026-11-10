import type { KnipConfig } from "knip"
import analyze, { ignoreDependencies } from "adamantite/analyze"

export default {
  ...analyze,
  // Agents run `pnpm packref` from the shell, as docs/agents/tooling.md says. No script or source
  // file names it, so Knip reports it as an unused devDependency.
  ignoreDependencies: [...ignoreDependencies.monorepo, "packref"],
  workspaces: {
    ".": {
      entry: ["scripts/*.{mjs,ts}", ".adamantite/rules/__tests__/*.test.ts"],
      project: ["scripts/**/*.{mjs,ts}", "turbo/generators/**/*.ts", ".adamantite/rules/**/*.ts"],
    },
    "packages/*": {
      entry: ["src/**/*.test-d.{ts,tsx}", "scripts/*.{mjs,ts}"],
      project: ["src/**/*.{ts,tsx}", "scripts/**/*.{mjs,ts}"],
    },
  },
} satisfies KnipConfig
