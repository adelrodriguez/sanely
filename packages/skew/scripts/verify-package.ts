// Packs the package, installs the tarball in a temporary consumer, and checks the runtime exports
// and declarations of each entry point. The consumer first loads the core entry point without the
// optional framework peers, then installs them and checks the React, Vite, and Next.js entry
// points.
//
// Usage, from packages/skew after a build: node scripts/verify-package.ts

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
const temporaryDirectory = mkdtempSync(join(tmpdir(), "sanely-skew-build-"))
const exportPaths = Object.values(packageJson.exports).flatMap((entrypoint) => [
  entrypoint.import,
  entrypoint.types,
])

function run(command: string, arguments_: string[], cwd: string) {
  execFileSync(command, arguments_, { cwd, stdio: "inherit" })
}

// The workspace version of a dependency, which also resolves `catalog:` ranges.
function installedVersion(dependency: string) {
  const manifest: unknown = JSON.parse(
    readFileSync(join(packageRoot, "node_modules", dependency, "package.json"), "utf8")
  )
  if (
    typeof manifest !== "object"
    || manifest === null
    || !("version" in manifest)
    || typeof manifest.version !== "string"
  ) {
    throw new Error(`Expected a version in the package.json of ${dependency}`)
  }
  return `${dependency}@${manifest.version}`
}

try {
  for (const exportPath of exportPaths) {
    if (!existsSync(join(packageRoot, exportPath))) {
      throw new Error(`The package export does not exist: ${exportPath}`)
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
    `${JSON.stringify({ name: "sanely-skew-build-verification", private: true, type: "module" }, null, 2)}\n`
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
import * as core from "@sanely/skew"

// The root exports exactly these values. A new export is a public API decision.
assert.deepEqual(Object.keys(core).toSorted(), [
  "InvalidOptionError",
  "TargetResolutionError",
  "createDeploymentMonitor",
  "fetchDescriptor",
  "parseDescriptor",
  "serializeDescriptor",
])
for (const [name, value] of Object.entries(core)) {
  assert.equal(typeof value, "function", \`\${name} must be a function export\`)
}

// \`@sanely/duration\` resolves from its own tarball and reads a time expression.
assert.throws(() => core.createDeploymentMonitor({ checkTimeout: "soon" }), {
  name: "InvalidOptionError",
  option: "checkTimeout",
})
assert.throws(() => core.createDeploymentMonitor({ checkInterval: Number.POSITIVE_INFINITY }), {
  name: "InvalidOptionError",
  option: "checkInterval",
})

// A monitor resolves a stale target from its options.
const monitor = core.createDeploymentMonitor({
  running: { id: "running" },
  target: () => Promise.resolve({ id: "target" }),
})
const state = await monitor.check()
assert.equal(state.status, "stale")
assert.equal(state.target?.id, "target")
`
  )
  run(process.execPath, ["core.mjs"], temporaryDirectory)

  run(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-package-lock",
      ...Object.keys(packageJson.peerDependencies).map((peer) => installedVersion(peer)),
      installedVersion("react-dom"),
      installedVersion("@types/node"),
      installedVersion("@types/react"),
      installedVersion("@types/react-dom"),
    ],
    temporaryDirectory
  )

  writeFileSync(
    join(temporaryDirectory, "adapters.mjs"),
    `import assert from "node:assert/strict"
import { DeploymentScript, GET, descriptorHandler, withDeploymentCheck } from "@sanely/skew/next"
import { useDeploymentStatus } from "@sanely/skew/react"
import { deploymentCheck } from "@sanely/skew/vite"

for (const value of [
  DeploymentScript,
  GET,
  descriptorHandler,
  withDeploymentCheck,
  useDeploymentStatus,
  deploymentCheck,
]) {
  assert.equal(typeof value, "function")
}
`
  )
  run(process.execPath, ["adapters.mjs"], temporaryDirectory)

  writeFileSync(
    join(temporaryDirectory, "consumer.ts"),
    `import {
  createDeploymentMonitor,
  fetchDescriptor,
  parseDescriptor,
  type Deployment,
  type DeploymentMonitor,
  type RuntimeEnvironment,
  type TargetResolver,
} from "@sanely/skew"
import {
  DeploymentScript,
  GET,
  descriptorHandler,
  withDeploymentCheck,
  type NextAdapterOptions,
  type NextConfigExport,
} from "@sanely/skew/next"
import { useDeploymentStatus, type DeploymentStatus } from "@sanely/skew/react"
import {
  deploymentCheck,
  type DeploymentIdOption,
  type DeploymentPlatform,
  type ViteAdapterOptions,
} from "@sanely/skew/vite"

const deployment: Deployment = parseDescriptor('{"v":1,"id":"consumer"}')
const target: TargetResolver = fetchDescriptor("/current.json")
const monitor: DeploymentMonitor = createDeploymentMonitor({
  checkInterval: "5m",
  checkTimeout: "10s",
  running: deployment,
  target,
})
const platform: DeploymentPlatform = "vercel"
const deploymentIdOption: DeploymentIdOption = { platform }
const vitePlugin = deploymentCheck({
  deploymentId: deploymentIdOption,
} satisfies ViteAdapterOptions)
const nextConfig: NextConfigExport = withDeploymentCheck({}, {
  deploymentId: { env: ["DEPLOYMENT_CHECK_SHA", "GIT_SHA"] },
} satisfies NextAdapterOptions)
declare const environment: RuntimeEnvironment
declare const hookStatus: DeploymentStatus

void [
  GET,
  environment,
  hookStatus,
  monitor,
  nextConfig,
  descriptorHandler,
  DeploymentScript,
  useDeploymentStatus,
  vitePlugin,
]
`
  )
  writeFileSync(
    join(temporaryDirectory, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          lib: ["ESNext", "DOM"],
          module: "Preserve",
          moduleResolution: "bundler",
          noEmit: true,
          skipLibCheck: false,
          strict: true,
          target: "ESNext",
          verbatimModuleSyntax: true,
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

  console.info("Verified the packed @sanely/skew runtime and declarations.")
} finally {
  rmSync(temporaryDirectory, { force: true, recursive: true })
}
