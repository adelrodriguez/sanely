// Packs the package in the current directory, installs the tarball in a temporary consumer, and
// checks that the consumer can load the entry point and type-check against its declarations.
//
// Usage, from a package directory after a build: node ../../scripts/verify-build.ts

import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const packageRoot = process.cwd()
const typescript = join(import.meta.dirname, "../node_modules/typescript/bin/tsc")

// Every file path in `exports`, `module`, and `types`, including nested conditions.
function exportTargets(value: unknown): string[] {
  if (typeof value === "string") {
    return [value]
  }

  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap((entry) => exportTargets(entry))
  }

  return []
}

function readManifest() {
  const manifest: unknown = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"))

  if (
    typeof manifest !== "object"
    || manifest === null
    || !("name" in manifest)
    || typeof manifest.name !== "string"
  ) {
    throw new Error(`Expected a package.json with a name in ${packageRoot}`)
  }

  const targets = Object.entries(manifest)
    .filter(([field]) => ["exports", "module", "types"].includes(field))
    .flatMap(([, value]) => exportTargets(value))

  if (
    !("exports" in manifest)
    || typeof manifest.exports !== "object"
    || manifest.exports === null
  ) {
    throw new Error("Expected a package export map")
  }
  const name = manifest.name
  const specifiers = Object.keys(manifest.exports).map((subpath) =>
    subpath === "." ? name : `${name}${subpath.slice(1)}`
  )

  return { name, specifiers, targets }
}

function run(command: string, arguments_: string[], cwd: string) {
  execFileSync(command, arguments_, { cwd, stdio: "inherit" })
}

const { name, specifiers, targets } = readManifest()
const temporaryDirectory = mkdtempSync(join(tmpdir(), "sanely-build-"))

try {
  for (const target of targets) {
    if (!existsSync(join(packageRoot, target))) {
      throw new Error(`The package export does not exist: ${target}`)
    }
  }

  run("pnpm", ["pack", "--pack-destination", temporaryDirectory], packageRoot)

  const tarballs = readdirSync(temporaryDirectory).filter((file) => file.endsWith(".tgz"))
  const [tarball] = tarballs
  if (!tarball || tarballs.length !== 1) {
    throw new Error(`Expected one package tarball, found ${tarballs.length}`)
  }

  writeFileSync(
    join(temporaryDirectory, "package.json"),
    `${JSON.stringify({ name: "sanely-build-verification", private: true, type: "module" }, null, 2)}\n`
  )
  run(
    "npm",
    ["install", "--ignore-scripts", "--no-package-lock", join(temporaryDirectory, tarball)],
    temporaryDirectory
  )

  writeFileSync(
    join(temporaryDirectory, "runtime.mjs"),
    specifiers.map((specifier) => `await import("${specifier}")`).join("\n")
  )
  run(process.execPath, ["runtime.mjs"], temporaryDirectory)

  writeFileSync(
    join(temporaryDirectory, "consumer.ts"),
    specifiers
      .map(
        (specifier, index) => `import * as entry${index} from "${specifier}"\nvoid entry${index}\n`
      )
      .join("\n")
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
  run(process.execPath, [typescript, "--project", "tsconfig.json"], temporaryDirectory)

  console.info(`Verified the packed runtime and declarations of ${name}.`)
} finally {
  rmSync(temporaryDirectory, { force: true, recursive: true })
}
