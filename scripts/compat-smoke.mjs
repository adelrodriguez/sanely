// Checks that each built package runs on the minimum supported runtime.
//
// The floor is the `engines.node` version in each package.json. A bundle must not import Node.js
// modules. This script also removes globals that are newer than the floor, so a run on a newer
// runtime fails in the same way as a run on the floor.
//
// Usage: node scripts/compat-smoke.mjs [package directory...]
// Without arguments, the script checks the package in the current directory.

import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

const packageDirectories = process.argv.length > 2 ? process.argv.slice(2) : ["."]

function check(condition, message) {
  if (!condition) {
    throw new Error(`Compatibility smoke test failed: ${message}`)
  }
}

if (typeof Array.prototype.toSorted !== "function") {
  throw new Error("This runtime is below the supported floor")
}

// Globals that Node.js added after 20.0.0.
delete RegExp.escape
delete Object.groupBy
delete Map.groupBy
delete Promise.withResolvers
delete Array.fromAsync
delete Error.isError
delete Math.sumPrecise
delete Set.prototype.difference
delete Set.prototype.intersection
delete Set.prototype.isDisjointFrom
delete Set.prototype.isSubsetOf
delete Set.prototype.isSupersetOf
delete Set.prototype.symmetricDifference
delete Set.prototype.union

/**
 * @param {string} directory
 */
async function checkPackage(directory) {
  const root = resolve(directory)
  /**
   * @type {{ name: string; exports: Record<string, { import: string }> }}
   */
  const manifest = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"))
  await Promise.all(
    Object.entries(manifest.exports).map(async ([subpath, target]) => {
      const entry = resolve(root, target.import)
      const content = await readFile(entry, "utf8")
      check(
        !/(?:from|import|require)\s*\(?\s*["']node:/.test(content),
        `${manifest.name}${subpath.slice(1)} imports no Node.js module`
      )
      await import(pathToFileURL(entry).href)
    })
  )

  console.info(`${manifest.name} loads on Node.js ${process.versions.node}.`)
}

await Promise.all(packageDirectories.map((directory) => checkPackage(directory)))
