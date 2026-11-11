import core from "adamantite/lint"
import react from "adamantite/lint/react"
import reactStrict from "adamantite/lint/react-strict"
import custom from "adamantite/rules"
import { defineConfig } from "oxlint"

// Every folder in `packages/ratelimit/src/lib` bans this pattern.
const ratelimitEntryPoints = {
  group: ["#index.ts", "#stores/**"],
  message: "lib must not import an entry point.",
}

// Each domain imports itself and only the lower domains in this map.
const dependencies: Record<string, Record<string, string[]>> = {
  core: {
    time: [],
  },
  cron: {
    api: [
      "describe",
      "fields",
      "grammar",
      "normalize",
      "schedule",
      "serialize",
      "validate",
      "vocabulary",
    ],
    describe: ["fields", "schedule", "serialize", "vocabulary"],
    fields: ["schedule", "vocabulary"],
    grammar: ["fields", "schedule", "serialize", "vocabulary"],
    normalize: ["describe", "fields", "grammar", "schedule", "serialize", "vocabulary"],
    schedule: ["vocabulary"],
    serialize: ["fields", "schedule", "vocabulary"],
    validate: ["describe", "fields", "grammar", "normalize", "schedule", "serialize", "vocabulary"],
    vocabulary: [],
  },
  duration: {
    convert: ["expression", "shared"],
    expression: ["shared"],
    format: ["shared"],
    shared: [],
  },
  flags: {
    changes: [],
    definition: ["errors", "shared"],
    errors: [],
    evaluation: ["definition", "errors", "identity", "provider", "shared", "sharing"],
    flags: [
      "changes",
      "definition",
      "errors",
      "evaluation",
      "identity",
      "provider",
      "shared",
      "sharing",
    ],
    identity: ["definition", "errors", "shared"],
    provider: ["changes", "definition", "errors", "identity", "shared"],
    shared: ["errors"],
    sharing: ["changes", "definition", "identity", "shared"],
  },
  // Each reader, such as `ip` or `geo`, imports the shared request domain and never another reader.
  request: {
    address: [],
    geo: ["request"],
    ip: ["address", "request"],
    request: [],
  },
  rpc: {
    adapters: ["core", "server", "wire"],
    client: ["core"],
    core: [],
    server: ["core"],
    wire: ["core", "server"],
  },
  try: {
    builder: ["execution", "orchestration", "policies", "shared"],
    composition: ["shared"],
    disposal: [],
    execution: ["disposal", "policies", "shared"],
    orchestration: ["disposal", "execution", "policies", "shared"],
    policies: ["disposal", "shared"],
    shared: ["disposal"],
  },
}

const publicEntries = [
  "#index.ts",
  "#errors.ts",
  "#types.ts",
  "#time.ts",
  "#wire.ts",
  "#wire/**",
  "#integrations/**",
  "#testing/**",
  "#stores/**",
  "#adapters/**",
]

type Override = NonNullable<Parameters<typeof defineConfig>[0]["overrides"]>[number]

const timeImports = {
  group: ["@sanely/**", "!@sanely/core", "!@sanely/core/time"],
  message: "Import shared time definitions through @sanely/core/time.",
}

// Flags, ratelimit, and skew read lengths of time with @sanely/duration, which they depend on at run time.
const durationImports = {
  group: [...timeImports.group, "!@sanely/duration"],
  message:
    "Import shared time definitions through @sanely/core/time, and time expressions through @sanely/duration.",
}

const workspaceImports: Record<string, { group: string[]; message: string }> = {
  core: {
    group: ["@sanely/**"],
    message: "Core must not import a package that depends on it.",
  },
  cron: timeImports,
  duration: timeImports,
  flags: durationImports,
  ratelimit: durationImports,
  skew: durationImports,
}

function packageImports(name: string) {
  const pattern = workspaceImports[name]
  return pattern ? [pattern] : []
}

const packageOverrides = Object.keys(workspaceImports).map<Override>((name) => ({
  files: [`packages/${name}/src/**/*.{ts,tsx}`],
  rules: {
    "no-restricted-imports": ["error", { patterns: packageImports(name) }],
  },
}))

const domainDefaults = Object.keys(dependencies).map<Override>((name) => ({
  files: [`packages/${name}/src/lib/**/*.{ts,tsx}`],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          ...packageImports(name),
          {
            group: [...publicEntries, "#lib/**"],
            message: "Declare the domain and its dependencies in oxlint.config.ts.",
          },
        ],
      },
    ],
  },
}))

const domainOverrides = Object.entries(dependencies).flatMap(([name, domains]) =>
  Object.entries(domains).map<Override>(([domain, lower]) => ({
    files: [`packages/${name}/src/lib/${domain}/**/*.{ts,tsx}`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...packageImports(name),
            { group: publicEntries, message: "lib must not import a public entry point." },
            {
              group: [
                "#lib/**",
                `!#lib/${domain}/**`,
                ...lower.map((dependency) => `!#lib/${dependency}/**`),
              ],
              message: `${domain} imports only its own modules and its declared lower domains.`,
            },
          ],
        },
      ],
    },
  }))
)

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
            allow: ["packages/flags/src/integrations/**"],
          },
        ],
      },
    },
    // gated's type tests scope each case in a block, and its lint config allowed that.
    {
      files: ["packages/flags/src/__tests__/types.test-d.tsx"],
      rules: { "no-lone-blocks": "off" },
    },
    // Each type-level case sits in its own block, including ones that declare nothing, as the
    // typedport lint config allowed.
    {
      files: ["packages/rpc/src/__tests__/types.test-d.ts"],
      rules: { "no-lone-blocks": "off" },
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
      files: ["packages/duration/src/__tests__/types.test-d.ts"],
      rules: { "no-lone-blocks": "off" },
    },
    {
      files: ["packages/cron/src/__tests__/types.test-d.ts"],
      rules: { "no-lone-blocks": "off" },
    },
    // Code in `src/` imports through `#` subpath imports, never through `../`.
    {
      files: ["packages/*/src/**/*.{ts,tsx}"],
      rules: {
        "import/no-relative-parent-imports": "error",
      },
    },
    // Each `src/lib` folder imports only the folders below it, so dependencies point one way. In
    // the starter, `shared` is the bottom layer and `greeting` builds on it. Give each new folder
    // its own override that lists the folders above it.
    {
      files: ["packages/*/src/lib/**/*.{ts,tsx}"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: publicEntries,
                message: "lib must not import the public entry point.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["packages/*/src/lib/shared/**/*.{ts,tsx}"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: [...publicEntries, "#lib/**"],
                message: "shared must not import other lib folders.",
              },
            ],
          },
        ],
      },
    },
    ...packageOverrides,
    ...domainDefaults,
    ...domainOverrides,
    ...["integrations", "testing"].map<Override>((unit) => ({
      files: [`packages/flags/src/${unit}/**/*.{ts,tsx}`],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              // This override replaces the package rule, so it repeats the package's imports.
              ...packageImports("flags"),
              {
                group: [...publicEntries, `!#${unit}/**`],
                message: `${unit} imports only its own modules and library domains.`,
              },
            ],
          },
        ],
      },
    })),
    // Dependencies inside `packages/ratelimit/src/lib` point one way, as its docs/architecture.md
    // describes:
    //
    //   options, expiring-map <- algorithms <- store <- transitions <- stores/*
    //                                                <- limiter
    //
    // These rules follow the generic `src/lib` rules above, because a later override replaces the
    // rule options of an earlier one. Each rule repeats `ratelimitEntryPoints` and `durationImports` for that reason. A
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
              durationImports,
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
              durationImports,
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
              durationImports,
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
              durationImports,
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
              durationImports,
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
              durationImports,
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
              durationImports,
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
    // earlier one. Each rule repeats `durationImports` for that reason. The last rule lets tests cross
    // these lines.
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
              durationImports,
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
              durationImports,
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
              durationImports,
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
              durationImports,
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
    {
      files: ["packages/*/src/**/__tests__/**"],
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
