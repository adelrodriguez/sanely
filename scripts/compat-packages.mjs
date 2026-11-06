// Prints the packages that the CI `compat` job checks, as a JSON array for a job matrix. A package
// takes part when it has a `test:compat` script and an `engines.node` floor such as `>=22`. The
// job runs the script on that exact floor, so `>=22` becomes `22.0.0`.
//
// Usage: node scripts/compat-packages.mjs

import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"

/**
 * @param {string} range
 */
function readFloor(range) {
  const match = /^>=\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(range.trim())

  if (!match) {
    throw new Error(`Expected an engines.node range such as ">=22", received "${range}"`)
  }

  const [, major, minor = "0", patch = "0"] = match

  return `${major}.${minor}.${patch}`
}

/**
 * @param {string} name
 */
async function readPackage(name) {
  const directory = join("packages", name)
  /**
   * @type {{ name: string; scripts?: Record<string, string>; engines?: { node?: string } }}
   */
  const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8"))
  const range = manifest.engines?.node

  if (!manifest.scripts?.["test:compat"] || !range) {
    return []
  }

  return [{ directory, name: manifest.name, node: readFloor(range) }]
}

const names = await readdir("packages")
const packages = await Promise.all(names.toSorted().map((name) => readPackage(name)))

console.info(JSON.stringify(packages.flat()))
