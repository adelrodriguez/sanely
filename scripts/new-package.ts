// Creates a package in `packages/<name>` from the starter, then installs dependencies. The scope,
// repository, author, and license come from the root package.json. The starter has the same
// example as the keel template, so every check passes before the package has code of its own.
//
// The script builds the package in a temporary folder and renames it into place, so a package
// folder is either complete or missing. When the folder exists, the script leaves it unchanged.
//
// Usage: pnpm run new-package [--name <name>] [--emoji <emoji>] [--description <text>]
// Flags skip their prompts.

import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, renameSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { stdin, stdout } from "node:process"
import { createInterface } from "node:readline/promises"
import { parseArgs } from "node:util"
import root from "../package.json" with { type: "json" }

const repositoryRoot = join(import.meta.dirname, "..")
const repositoryHome = root.homepage.replace(/#readme$/, "")

const { values: flags } = parseArgs({
  options: {
    description: { type: "string" },
    emoji: { type: "string" },
    name: { type: "string" },
  },
})

const prompt = createInterface({ input: stdin, output: stdout })

async function ask(question: string): Promise<string> {
  const answer = await prompt.question(`${question}: `)

  return answer.trim() || ask(question)
}

const name = flags.name ?? (await ask("Package name, without the scope"))
const emoji = flags.emoji ?? (await ask("Emoji"))
const description = flags.description ?? (await ask("Description"))
prompt.close()

if (!/^[a-z][a-z0-9-]*$/.test(name)) {
  throw new Error(`Expected a lowercase package name without a scope, received "${name}"`)
}

const directory = `packages/${name}`
const packageName = `@${root.name}/${name}`

// The README header is an HTML block, where GitHub reads `<T>` as a tag even inside backticks.
function escapeHtml(text: string) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

// Quotes a value for the package.json text below.
function quote(value: string) {
  return JSON.stringify(value)
}

const files = {
  "README.md": `<div align="center">
  <h1 align="center">${escapeHtml(emoji)} <code>${packageName}</code></h1>

  <p align="center">
    <strong>${escapeHtml(description)}</strong>
  </p>
</div>

## Install

\`\`\`sh
npm install ${packageName}
\`\`\`
`,
  // Changesets skips private packages. Remove `private` when the package is ready to publish.
  "package.json": `{
  "name": ${quote(packageName)},
  "version": "0.0.1",
  "private": true,
  "description": ${quote(description)},
  "keywords": [],
  "homepage": ${quote(`${repositoryHome}/tree/main/${directory}#readme`)},
  "bugs": {
    "url": ${quote(root.bugs.url)}
  },
  "license": ${quote(root.license)},
  "author": ${quote(root.author)},
  "repository": {
    "type": "git",
    "url": ${quote(root.repository.url)},
    "directory": ${quote(directory)}
  },
  "files": [
    "dist"
  ],
  "type": "module",
  "sideEffects": false,
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "imports": {
    "#*": "./src/*"
  },
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsdown",
    "build:debug": "tsdown --no-minify --sourcemap",
    "build:verify": "node ../../scripts/verify-build.ts",
    "dev": "tsdown --no-minify --sourcemap --watch",
    "test": "vitest run",
    "test:compat": "node ../../scripts/compat-smoke.mjs",
    "test:coverage": "vitest run --coverage",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "@vitest/coverage-v8": "catalog:",
    "tsdown": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
`,
  "src/__tests__/types.test-d.ts": `import { describe, expectTypeOf, it } from "vitest"
import type { InvalidNameError } from "#index.ts"
import { greet } from "#index.ts"

describe("greet", () => {
  it("returns a greeting template literal", () => {
    expectTypeOf(greet("Ada")).toEqualTypeOf<\`Hello, \${string}!\`>()
  })

  it("accepts only strings", () => {
    // @ts-expect-error -- greet takes a string.
    greet(1)
  })
})

describe("InvalidNameError", () => {
  it("stores the input", () => {
    expectTypeOf<InvalidNameError["value"]>().toEqualTypeOf<string>()
  })
})
`,
  "src/index.ts": `export { greet } from "#lib/greeting/greeting.ts"
export { InvalidNameError } from "#lib/shared/errors.ts"
`,
  "src/lib/greeting/__tests__/greeting.test.ts": `import { describe, expect, it } from "vitest"
import { greet } from "#lib/greeting/greeting.ts"
import { InvalidNameError } from "#lib/shared/errors.ts"

describe("greet", () => {
  it("greets the trimmed name", () => {
    expect(greet("  Ada ")).toBe("Hello, Ada!")
  })

  it("throws InvalidNameError with the input for a blank name", () => {
    expect(() => greet("   ")).toThrow(new InvalidNameError("   "))
  })
})
`,
  "src/lib/greeting/greeting.ts": `import { InvalidNameError } from "#lib/shared/errors.ts"

export function greet(name: string) {
  const trimmed = name.trim()

  if (trimmed === "") {
    throw new InvalidNameError(name)
  }

  return \`Hello, \${trimmed}!\` as const
}
`,
  "src/lib/shared/errors.ts": `export class InvalidNameError extends Error {
  override readonly name = "InvalidNameError"
  readonly value: string

  constructor(value: string) {
    super(\`Expected a non-empty name, received "\${value}"\`)
    this.value = value
  }
}
`,
  "tsconfig.build.json": `{
  "extends": "./tsconfig.json",
  "include": ["src"],
  "exclude": ["node_modules", "dist", "*.config.ts"]
}
`,
  "tsconfig.json": `{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "*.config.ts"],
  "exclude": ["node_modules", "dist"]
}
`,
  "tsdown.config.ts": `import { defineConfig } from "tsdown"

export default defineConfig({
  clean: true,
  dts: true,
  entry: ["src/index.ts"],
  fixedExtension: false,
  minify: true,
  outDir: "dist",
  platform: "node",
  sourcemap: false,
  tsconfig: "tsconfig.build.json",
})
`,
  "vitest.config.ts": `import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
    },
    include: ["src/**/*.test.ts"],
  },
})
`,
}

const target = join(repositoryRoot, directory)

if (existsSync(target)) {
  console.info(`${directory} already exists. Nothing changed.`)
} else {
  const staging = mkdtempSync(join(repositoryRoot, "packages", `.${name}-`))

  for (const [file, contents] of Object.entries(files)) {
    const path = join(staging, file)

    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, contents)
  }

  renameSync(staging, target)
  console.info(`Created ${packageName} in ${directory}.`)
}

execFileSync("pnpm", ["install"], { cwd: repositoryRoot, stdio: "inherit" })

console.info("Add the package to the table in README.md, then run pnpm run check.")
