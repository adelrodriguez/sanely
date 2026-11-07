import core from "adamantite/lint"
import custom from "adamantite/lint/custom"
import { defineConfig } from "oxlint"

// Every folder in `packages/cron/src/lib` bans this pattern.
const cronEntryPoint = {
  group: ["#index.ts"],
  message: "lib must not import the public entry point.",
}

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
    // Dependencies inside `packages/cron/src/lib` point one way, from the bottom up:
    //
    //   vocabulary <- schedule <- fields <- serialize <- grammar  <- normalize <- validate <- api
    //                                                <- describe
    //
    // grammar (phrase to schedule) and describe (schedule to phrase) are siblings and never
    // import each other. These rules follow the generic `src/lib` rules above, because a later
    // override replaces the rule options of an earlier one. Each rule repeats `cronEntryPoint`
    // for that reason. A folder without a rule of its own may import nothing else in lib, and
    // `api` may import every layer. The last rule lets tests cross these lines.
    {
      files: ["packages/cron/src/lib/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              cronEntryPoint,
              {
                group: ["#lib/**"],
                message: "This folder has no layer. Add its rule to oxlint.config.ts.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["packages/cron/src/lib/vocabulary/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              cronEntryPoint,
              {
                group: ["#lib/**"],
                message: "vocabulary imports nothing else in lib.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["packages/cron/src/lib/schedule/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              cronEntryPoint,
              {
                group: ["#lib/**", "!#lib/vocabulary/**"],
                message: "schedule imports only vocabulary.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["packages/cron/src/lib/fields/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              cronEntryPoint,
              {
                group: ["#lib/**", "!#lib/vocabulary/**", "!#lib/schedule/**"],
                message: "fields imports only vocabulary and schedule.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["packages/cron/src/lib/serialize/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              cronEntryPoint,
              {
                group: ["#lib/**", "!#lib/vocabulary/**", "!#lib/schedule/**", "!#lib/fields/**"],
                message: "serialize imports only vocabulary, schedule, and fields.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["packages/cron/src/lib/grammar/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              cronEntryPoint,
              {
                group: [
                  "#lib/**",
                  "!#lib/vocabulary/**",
                  "!#lib/schedule/**",
                  "!#lib/fields/**",
                  "!#lib/serialize/**",
                ],
                message: "grammar imports only the layers below it, and never describe.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["packages/cron/src/lib/describe/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              cronEntryPoint,
              {
                group: [
                  "#lib/**",
                  "!#lib/vocabulary/**",
                  "!#lib/schedule/**",
                  "!#lib/fields/**",
                  "!#lib/serialize/**",
                ],
                message: "describe imports only the layers below it, and never grammar.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["packages/cron/src/lib/normalize/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              cronEntryPoint,
              {
                group: [
                  "#lib/**",
                  "!#lib/vocabulary/**",
                  "!#lib/schedule/**",
                  "!#lib/fields/**",
                  "!#lib/serialize/**",
                  "!#lib/grammar/**",
                  "!#lib/describe/**",
                ],
                message: "normalize imports only the layers below it.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["packages/cron/src/lib/validate/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              cronEntryPoint,
              {
                group: [
                  "#lib/**",
                  "!#lib/vocabulary/**",
                  "!#lib/schedule/**",
                  "!#lib/fields/**",
                  "!#lib/serialize/**",
                  "!#lib/grammar/**",
                  "!#lib/describe/**",
                  "!#lib/normalize/**",
                ],
                message: "validate imports only the layers below it.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["packages/cron/src/lib/api/**/*.ts"],
      rules: { "no-restricted-imports": ["error", { patterns: [cronEntryPoint] }] },
    },
    {
      files: ["packages/cron/src/**/__tests__/**"],
      rules: { "no-restricted-imports": "off" },
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
