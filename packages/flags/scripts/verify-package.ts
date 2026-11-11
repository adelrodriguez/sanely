import { execFileSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
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

  const reactEntry = join(packageRoot, packageJson.exports["./react"].import)
  if (!readFileSync(reactEntry, "utf8").startsWith('"use client";')) {
    throw new Error("The React entry must retain its client directive")
  }

  // The entry points must share one `anonymous` symbol, or React would not recognize the value
  // that the core exports.
  const distDirectory = join(packageRoot, "dist")
  const anonymousDefinitions = readdirSync(distDirectory, { recursive: true })
    .map(String)
    .filter((file) => file.endsWith(".js"))
    .filter((file) =>
      readFileSync(join(distDirectory, file), "utf8").includes('Symbol("@sanely/flags/anonymous")')
    )
  if (anonymousDefinitions.length !== 1) {
    throw new Error(
      `Expected one built definition of anonymous, found ${anonymousDefinitions.length}`
    )
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
  // npm may not have the workspace dependency versions that the tarball names, so install each
  // from its own tarball.
  const dependencyDirectory = join(temporaryDirectory, "dependencies")
  mkdirSync(dependencyDirectory)
  for (const dependency of Object.keys(packageJson.dependencies)) {
    const dependencyRoot = realpathSync(join(packageRoot, "node_modules", dependency))
    run("pnpm", ["pack", "--pack-destination", dependencyDirectory], dependencyRoot)
  }
  const dependencyTarballs = readdirSync(dependencyDirectory).map((file) =>
    join(dependencyDirectory, file)
  )
  run(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-package-lock",
      "--omit=peer",
      tarballPath,
      ...dependencyTarballs,
    ],
    temporaryDirectory
  )

  writeFileSync(
    join(temporaryDirectory, "core.mjs"),
    `import assert from "node:assert/strict"
import { anonymous, createFlags, decision, defineProvider, flag } from "@sanely/flags"
import { fakeProvider, memoryStore } from "@sanely/flags/testing"

const beta = flag.boolean("beta", false)
const theme = flag.variant("theme", ["light", "dark"], "light")

const provider = defineProvider({
  decideOne: (definition) =>
    definition.kind === "boolean" ? decision.boolean(true) : decision.variant("dark"),
  name: "consumer",
})
const flags = createFlags({ identify: () => ({ distinctId: "consumer" }), provider })
assert.deepEqual(await flags.getMany([beta, theme]), [true, "dark"])
assert.equal(await createFlags({ provider }).for({ distinctId: "caller" }).get(beta), true)

const fake = createFlags({
  cache: { store: memoryStore() },
  identify: () => ({ distinctId: "consumer" }),
  provider: fakeProvider([[theme, "dark"]]),
})
assert.equal(await fake.get(theme), "dark")
assert.equal((await fake.details(theme)).source, "cache")
assert.equal((await fake.details(beta)).error._tag, "InvalidDecisionError")

const snapshot = await createFlags({ identify: () => anonymous, provider: fakeProvider([[beta, true]]) })
  .snapshot([beta])
assert.deepEqual(snapshot, {
  distinctId: null,
  flags: { beta: { kind: "boolean", source: "provider", value: true } },
})
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
  "FlagsProvider",
  "FlagsProviderMissingError",
  "useFlag",
  "useFlagCache",
  "useFlags",
].toSorted())
`
  )
  run(process.execPath, ["react.mjs"], temporaryDirectory)

  writeFileSync(
    join(temporaryDirectory, "consumer.ts"),
    `import {
  createFlags,
  decision,
  defineProvider,
  flag,
  type EvaluationDetails,
  type Flags,
  type FlagSnapshot,
  type Identity,
} from "@sanely/flags"
import type { FlagCacheControls, FlagsProviderProps } from "@sanely/flags/react"
import { fakeProvider, type FakeProvider } from "@sanely/flags/testing"

type User = Identity & { plan: "free" | "pro" }

const provider = defineProvider({
  decideOne: (_flag, identity: User) => decision.boolean(identity.plan === "pro"),
  name: "consumer",
})
const beta = flag.boolean("beta", false)
const theme = flag.variant("theme", ["light", "dark"], "light")

const flags: Flags<User> = createFlags({
  identify: () => ({ distinctId: "consumer", plan: "pro" }),
  provider,
})
const details: Promise<EvaluationDetails<typeof theme>> = flags.details(theme)
const values: Promise<[boolean, "light" | "dark"]> = flags.getMany([beta, theme])
const snapshot: Promise<FlagSnapshot> = flags.snapshot([beta, theme])
const props: FlagsProviderProps<typeof flags> = { children: null, flags }
const fake: FakeProvider = fakeProvider([[theme, "dark"]])
declare const controls: FlagCacheControls

void details
void values
void snapshot
void props
void fake
void controls
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
