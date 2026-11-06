import core from "adamantite/lint"
import custom from "adamantite/lint/custom"
import react from "adamantite/lint/react"
import reactStrict from "adamantite/lint/react-strict"
import { defineConfig } from "oxlint"

// Every folder in `packages/ratelimit/src/lib` bans this pattern.
const ratelimitEntryPoints = {
  group: ["#index.ts", "#stores/**"],
  message: "lib must not import an entry point.",
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
    // gated linted its React integration with the React presets. Keep them for this package.
    {
      files: ["packages/flags/**/*.{ts,tsx}"],
      jsPlugins: reactStrict.jsPlugins,
      plugins: react.plugins,
      rules: {
        ...react.rules,
        ...reactStrict.rules,
        "adamantite/no-react-state-hooks": [
          "error",
          {
            allow: [
              "**/use[A-Z]*.{ts,tsx}",
              "**/use-*.{ts,tsx}",
              "**/hooks/**",
              "packages/flags/src/integrations/**",
            ],
          },
        ],
      },
    },
    // gated's type tests scope each case in a block, and its lint config allowed that.
    {
      files: ["packages/flags/src/__tests__/types.test-d.ts"],
      rules: { "no-lone-blocks": "off" },
    },
    // Each type-level case sits in its own block, including ones that declare nothing, as the
    // typedport lint config allowed.
    {
      files: ["packages/rpc/src/__tests__/types.test-d.ts"],
      rules: { "no-lone-blocks": "off" },
    },
    // The source builder and its execution modules share recursive type contracts.
    // Keep runtime cycle checks while preserving those public types during the move.
    {
      files: ["packages/try/src/**/*.ts"],
      rules: { "import/no-cycle": ["error", { ignoreTypes: true }] },
    },
    {
      files: ["packages/try/src/__tests__/types.test-d.ts"],
      rules: { "no-lone-blocks": "off" },
    },
    // Preserve Fault's public name and the source's conditional payload types.
    {
      files: ["packages/errors/src/lib/fault.ts"],
      rules: { "unicorn/custom-error-definition": "off" },
    },
    {
      files: ["packages/errors/src/lib/registry.ts"],
      rules: { "typescript/no-invalid-void-type": "off" },
    },
    {
      files: ["packages/errors/src/lib/registry.ts", "packages/errors/src/lib/tagged.ts"],
      rules: { "typescript/no-generated-empty-object-type": "off" },
    },
    {
      files: ["packages/errors/src/__tests__/types.test-d.ts"],
      rules: { "no-lone-blocks": "off" },
    },
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
    // Dependencies inside `packages/ratelimit/src/lib` point one way, as its docs/architecture.md
    // describes:
    //
    //   options, expiring-map <- algorithms <- store <- transitions <- stores/*
    //                                                <- limiter
    //
    // These rules follow the generic `src/lib` rules above, because a later override replaces the
    // rule options of an earlier one. Each rule repeats `ratelimitEntryPoints` for that reason. A
    // folder without a rule of its own may import nothing else in lib. The last rule lets tests
    // cross these lines.
    {
      files: ["packages/ratelimit/src/lib/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              ratelimitEntryPoints,
              {
                group: ["#lib/**"],
                message:
                  "This folder has no layer. Add its rule to oxlint.config.ts and its place to packages/ratelimit/docs/architecture.md.",
              },
            ],
          },
        ],
      },
    },
    {
      files: [
        "packages/ratelimit/src/lib/options/**/*.ts",
        "packages/ratelimit/src/lib/expiring-map/**/*.ts",
      ],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              ratelimitEntryPoints,
              {
                group: ["#lib/**"],
                message: "options and expiring-map import nothing else in lib.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["packages/ratelimit/src/lib/algorithms/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              ratelimitEntryPoints,
              {
                group: ["#lib/**", "!#lib/options/**"],
                message: "algorithms import only options.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["packages/ratelimit/src/lib/store/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              ratelimitEntryPoints,
              {
                group: ["#lib/**", "!#lib/algorithms/**"],
                message: "The store contract imports only algorithms.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["packages/ratelimit/src/lib/transitions/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              ratelimitEntryPoints,
              {
                group: ["#lib/**", "!#lib/algorithms/**", "!#lib/store/**"],
                message: "transitions import only algorithms and the store contract.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["packages/ratelimit/src/lib/stores/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              ratelimitEntryPoints,
              {
                group: ["#lib/stores/**", "#lib/limiter/**"],
                message:
                  "A store imports its own files with ./, and never another store or limiters.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["packages/ratelimit/src/lib/limiter/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              ratelimitEntryPoints,
              {
                group: ["#lib/stores/**", "#lib/transitions/**"],
                message:
                  "Limiters know only the store contract, not a concrete store or its arithmetic.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["packages/ratelimit/src/**/__tests__/**"],
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
