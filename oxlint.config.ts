import core from "adamantite/lint"
import custom from "adamantite/lint/custom"
import { defineConfig } from "oxlint"

export default defineConfig({
  extends: [core, custom()],
  ignorePatterns: core.ignorePatterns,
  options: {
    respectEslintDisableDirectives: true,
    typeAware: true,
    typeCheck: true,
  },
  overrides: [
    {
      files: ["packages/duration/src/__tests__/types.test-d.ts"],
      rules: { "no-lone-blocks": "off" },
    },
    {
      files: ["packages/cron/src/__tests__/types.test-d.ts"],
      rules: { "no-lone-blocks": "off" },
    },
    // Code in `src/` imports through `#` subpath imports, never through `../`.
    {
      files: ["packages/*/src/**/*.ts"],
      rules: {
        "import/no-relative-parent-imports": "error",
      },
    },
    // Each `src/lib` folder imports only the folders below it, so dependencies point one way. In
    // the starter, `shared` is the bottom layer and `greeting` builds on it. Give each new folder
    // its own override that lists the folders above it.
    {
      files: ["packages/*/src/lib/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: ["#index.ts"],
                message: "lib must not import the public entry point.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["packages/*/src/lib/shared/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: ["#index.ts", "#lib/greeting/**"],
                message: "shared must not import other lib folders.",
              },
            ],
          },
        ],
      },
    },
    {
      // JSDoc is the only type syntax available in plain JavaScript files.
      files: ["scripts/**/*.mjs", "packages/*/scripts/**/*.mjs"],
      rules: { "jsdoc/check-tag-names": ["error", { typed: false }] },
    },
  ],
  rules: {
    // Also report cycles that pass through type-only imports.
    "import/no-cycle": ["error", { ignoreTypes: false }],
  },
})
