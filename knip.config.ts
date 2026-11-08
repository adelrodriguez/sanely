import type { KnipConfig } from "knip"
import analyze, { ignoreDependencies } from "adamantite/analyze"

export default {
  ...analyze,
  ignoreDependencies: ignoreDependencies.monorepo,
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
