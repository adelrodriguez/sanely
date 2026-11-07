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

// Every folder in `packages/cron/src/lib` bans this pattern.
const cronEntryPoint = {
  group: ["#index.ts"],
  message: "lib must not import the public entry point.",
}

export default defineConfig({
  extends: [core, custom()],
  ignorePatterns: [
    ...core.ignorePatterns,
    // These fixtures import the built package by name, so they lint only after a build.
    "packages/skew/tests/package-contract/**",
  ],
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
    // Imports in `packages/skew/src` point one way: the
    // protocol, then the runtime, then integrations. Adapters import only the protocol and
    // `adapters/shared.ts`, and an integration never imports an adapter. These rules follow the
    // generic `src/lib` rules above, because a later override replaces the rule options of an
    // earlier one. The last rule lets tests cross these lines.
    {
      files: ["packages/skew/src/lib/protocol/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: ["#index.ts"],
                message: "skew code must not import the public entry point.",
              },
              {
                group: ["#lib/runtime/**", "#integrations/**", "#adapters/**"],
                message: "protocol imports nothing else in skew.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["packages/skew/src/lib/runtime/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: ["#index.ts"],
                message: "skew code must not import the public entry point.",
              },
              {
                group: ["#integrations/**", "#adapters/**"],
                message: "runtime imports only the protocol.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["packages/skew/src/integrations/**/*.{ts,tsx}"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: ["#index.ts"],
                message: "skew code must not import the public entry point.",
              },
              {
                group: ["#adapters/**"],
                message: "An integration never imports an adapter.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["packages/skew/src/adapters/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: ["#index.ts"],
                message: "skew code must not import the public entry point.",
              },
              {
                group: [
                  "#lib/**",
                  "!#lib/protocol/**",
                  "#integrations/**",
                  "#adapters/**",
                  "!#adapters/shared.ts",
                ],
                message: "Adapters import only the protocol and adapters/shared.ts.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["packages/skew/src/**/__tests__/**"],
      rules: { "no-restricted-imports": "off" },
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
