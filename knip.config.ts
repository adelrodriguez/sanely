import type { KnipConfig } from "knip"
import analyze, { ignoreDependencies } from "adamantite/analyze"

export default {
  ...analyze,
  ignoreDependencies: ignoreDependencies.monorepo,
  workspaces: {
    ".": {
      entry: ["scripts/*.{mjs,ts}"],
      project: ["scripts/**/*.{mjs,ts}", "turbo/generators/**/*.ts"],
    },
    "packages/*": {
      entry: ["src/__tests__/types.test-d.ts"],
      project: ["src/**/*.ts"],
    },
  },
} satisfies KnipConfig
