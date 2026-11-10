import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { after } from "node:test"

const root = mkdtempSync(join(tmpdir(), "sanely-structure-"))
let next = 0
after(() => {
  rmSync(root, { force: true, recursive: true })
})

const DEFAULT_MANIFEST = { exports: { ".": "./dist/index.js", "./errors": "./dist/errors.js" } }

export function fixture(
  path: string,
  siblings: string[] = [],
  manifest: object = DEFAULT_MANIFEST
) {
  const packageRoot = join(root, String(next), "packages/example")
  next += 1
  const filename = join(packageRoot, "src", path)
  for (const source of [path, ...siblings]) {
    const target = join(packageRoot, "src", source)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, "export {}\n")
  }
  writeFileSync(join(packageRoot, "package.json"), JSON.stringify(manifest))
  return { code: "export {}", filename }
}
