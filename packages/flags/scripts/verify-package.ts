import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import packageJson from "../package.json" with { type: "json" }

const packageRoot = join(import.meta.dirname, "..")
const temporaryDirectory = mkdtempSync(join(tmpdir(), "flags-build-"))
const expectedFiles = Object.values(packageJson.exports).flatMap((entrypoint) => [
  entrypoint.import,
  entrypoint.types,
])

function run(command: string, arguments_: string[], cwd: string): void {
  execFileSync(command, arguments_, { cwd, stdio: "inherit" })
}

try {
  for (const relativePath of expectedFiles) {
    if (!existsSync(join(packageRoot, relativePath))) {
      throw new Error(`The package export does not exist: ${relativePath}`)
    }
  }

  run("pnpm", ["pack", "--pack-destination", temporaryDirectory], packageRoot)

  const tarballs = readdirSync(temporaryDirectory).filter((file) => file.endsWith(".tgz"))
  const [tarball] = tarballs
  if (!tarball || tarballs.length !== 1) {
    throw new Error(`Expected one package tarball, found ${tarballs.length}`)
  }

  const tarballPath = join(temporaryDirectory, tarball)
  writeFileSync(
    join(temporaryDirectory, "package.json"),
    `${JSON.stringify({ name: "flags-build-verification", private: true, type: "module" }, null, 2)}\n`
  )
  run(
    "npm",
    ["install", "--ignore-scripts", "--no-package-lock", "--omit=peer", tarballPath],
    temporaryDirectory
  )

  writeFileSync(
    join(temporaryDirectory, "core.mjs"),
    `import assert from "node:assert/strict"
import { createFlags, decision } from "@sanely/flags"
import { defineHook } from "@sanely/flags/hooks"

const factory = createFlags({
  decide: () => decision.boolean(true),
  identify: () => ({ distinctId: "consumer" }),
})

assert.equal(await factory({ defaultValue: false, key: "beta" })(), true)
assert.deepEqual(defineHook({}), {})
`
  )
  run(process.execPath, ["core.mjs"], temporaryDirectory)

  run(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-package-lock",
      `react@${packageJson.devDependencies.react}`,
      `@types/react@${packageJson.devDependencies["@types/react"]}`,
    ],
    temporaryDirectory
  )

  writeFileSync(
    join(temporaryDirectory, "react.mjs"),
    `import assert from "node:assert/strict"
import * as react from "@sanely/flags/react"

assert.deepEqual(Object.keys(react).toSorted(), [
  "FeatureFlag",
  "FlagProvider",
  "createFlagCache",
  "createFlagHooks",
  "useFlag",
  "useFlagBatch",
  "useFlagCache",
].toSorted())
`
  )
  run(process.execPath, ["react.mjs"], temporaryDirectory)

  writeFileSync(
    join(temporaryDirectory, "consumer.ts"),
    `import { createFlags, decision, type EvaluationDetails } from "@sanely/flags"
import { defineHook } from "@sanely/flags/hooks"
import { createFlagCache, type FlagValueOf, type ReactFlagCache } from "@sanely/flags/react"

const factory = createFlags({
  decide: () => decision.boolean(true),
  identify: () => ({ distinctId: "consumer" }),
})
const evaluator = factory({ defaultValue: false, key: "beta" })
const value: FlagValueOf<typeof evaluator> = true
const details: EvaluationDetails<boolean> = {
  flagKey: "beta",
  source: "provider",
  value,
}
const cache: ReactFlagCache = createFlagCache()

defineHook({})
void cache
void details
`
  )
  writeFileSync(
    join(temporaryDirectory, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          module: "NodeNext",
          moduleResolution: "NodeNext",
          noEmit: true,
          strict: true,
          target: "ESNext",
        },
        files: ["consumer.ts"],
      },
      null,
      2
    )}\n`
  )
  run(
    process.execPath,
    [join(packageRoot, "node_modules/typescript/bin/tsc"), "--project", "tsconfig.json"],
    temporaryDirectory
  )

  console.info("Verified the packed @sanely/flags runtime and declarations.")
} finally {
  rmSync(temporaryDirectory, { force: true, recursive: true })
}
