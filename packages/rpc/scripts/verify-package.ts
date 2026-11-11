// Packs the package, installs the tarball in a temporary consumer, and checks the named runtime
// exports and declarations of each entry point. `../../scripts/verify-build.ts` checks only that
// each entry point loads.
//
// Usage, from packages/rpc after a build: node scripts/verify-package.ts

import { execFileSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import packageJson from "../package.json" with { type: "json" }

const packageRoot = join(import.meta.dirname, "..")
const temporaryDirectory = mkdtempSync(join(tmpdir(), "sanely-rpc-build-"))
const exportPaths = Object.values(packageJson.exports).flatMap((entrypoint) => [
  entrypoint.import,
  entrypoint.types,
])

function run(command: string, arguments_: string[], cwd: string) {
  execFileSync(command, arguments_, { cwd, stdio: "inherit" })
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
    `${JSON.stringify({ name: "sanely-rpc-build-verification", private: true, type: "module" }, null, 2)}\n`
  )
  // npm may not have the workspace dependency versions that the tarball names, so install each
  // from its own tarball.
  const dependencyDirectory = join(temporaryDirectory, "dependencies")
  mkdirSync(dependencyDirectory)
  for (const [dependency, version] of Object.entries(packageJson.dependencies)) {
    if (!version.startsWith("workspace:")) continue
    const dependencyRoot = realpathSync(join(packageRoot, "node_modules", dependency))
    run("pnpm", ["pack", "--pack-destination", dependencyDirectory], dependencyRoot)
  }
  const dependencyTarballs = readdirSync(dependencyDirectory).map((file) =>
    join(dependencyDirectory, file)
  )
  run(
    "npm",
    ["install", "--ignore-scripts", "--no-package-lock", tarballPath, ...dependencyTarballs],
    temporaryDirectory
  )

  writeFileSync(
    join(temporaryDirectory, "runtime.mjs"),
    `import assert from "node:assert/strict"
import { channel, createClient, createRouter, defineContract, implement, SetupError } from "@sanely/rpc"
import { connect, fromWire, toWire } from "@sanely/rpc/wire"
import { fetchHandler, fetchTransport } from "@sanely/rpc/wire/fetch"
import { mainPort, nodePort, sendPort } from "@sanely/rpc/wire/message-port"
import { webSocket, whenOpen } from "@sanely/rpc/wire/web-socket"

for (const value of [
  channel,
  createClient,
  createRouter,
  defineContract,
  implement,
  connect,
  fromWire,
  toWire,
  fetchHandler,
  fetchTransport,
  mainPort,
  nodePort,
  sendPort,
  webSocket,
  whenOpen,
]) {
  assert.equal(typeof value, "function")
}

const wire = { onMessage: () => () => {}, send: () => {} }
connect(wire, { timeout: "1.5s" }).close()
assert.throws(() => connect(wire, { timeout: "soon" }), SetupError)
`
  )
  run(process.execPath, ["runtime.mjs"], temporaryDirectory)

  writeFileSync(
    join(temporaryDirectory, "consumer.ts"),
    `import type { InferClient, Router, Transport } from "@sanely/rpc"
import type { Wire, WireResult } from "@sanely/rpc/wire"
import type { FetchHandlerOptions } from "@sanely/rpc/wire/fetch"
import type { NodePortLike } from "@sanely/rpc/wire/message-port"
import type { WebSocketLike } from "@sanely/rpc/wire/web-socket"

import { connect } from "@sanely/rpc/wire"

export type Exports = [InferClient<never>, Router, Transport, Wire, WireResult, FetchHandlerOptions, NodePortLike, WebSocketLike]

declare const wire: Wire
connect(wire, { timeout: "5s" })
// @ts-expect-error -- a literal that is not a time expression fails to compile
connect(wire, { timeout: "1M" })
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
          skipLibCheck: false,
          strict: true,
          target: "ESNext",
          types: [],
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

  console.info("Verified the packed @sanely/rpc runtime and declarations.")
} finally {
  rmSync(temporaryDirectory, { force: true, recursive: true })
}
