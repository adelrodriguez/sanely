import { existsSync, readFileSync, readdirSync } from "node:fs"
import { basename, dirname, extname, join } from "node:path"
import { defineRule } from "adamantite/rules"

export default defineRule({
  createOnce(context) {
    return {
      Program(node) {
        const filename = context.filename.replaceAll("\\", "/")
        const match = filename.match(/^(.*\/packages\/[^/]+)\/src\/(.+)$/)
        const packageRoot = match?.[1]
        const sourcePath = match?.[2]
        if (!packageRoot || !sourcePath || sourcePath.startsWith("__tests__/")) return
        const parent = dirname(filename)
        const testName = basename(filename).match(/^(.*)\.(?:test|bench)(?:-d)?\.tsx?$/)?.[1]
        if (testName !== undefined) {
          if (basename(parent) !== "__tests__") context.report({ messageId: "colocate", node })
          else if (
            ![".ts", ".tsx"].some((extension) =>
              existsSync(join(parent, "..", `${testName}${extension}`))
            )
          )
            context.report({ messageId: "owner", node })
          return
        }
        if (sourcePath.includes("/__tests__/")) return
        const name = basename(filename, extname(filename))
        if (name === basename(parent)) context.report({ messageId: "main", node })
        if (
          dirname(sourcePath) === "lib"
          && existsSync(parent)
          && readdirSync(parent, { withFileTypes: true }).some(
            (entry) => entry.isDirectory() && entry.name !== "__tests__"
          )
        )
          context.report({ messageId: "domain", node })
        if (dirname(sourcePath) === ".") {
          const manifestPath = join(packageRoot, "package.json")
          if (!existsSync(manifestPath)) return
          const manifest: unknown = JSON.parse(readFileSync(manifestPath, "utf8"))
          if (
            typeof manifest !== "object"
            || manifest === null
            || !("exports" in manifest)
            || typeof manifest.exports !== "object"
            || manifest.exports === null
          )
            return
          const entry = name === "index" ? "." : `./${name}`
          if (!Object.hasOwn(manifest.exports, entry))
            context.report({ messageId: "publicEntry", node })
        }
      },
    }
  },
  meta: {
    docs: {
      description:
        "Keep package entry points, domain modules, and colocated tests in their owning folders.",
    },
    messages: {
      colocate: "Put a module test or benchmark in the adjacent __tests__ folder.",
      domain: "Put implementation in a domain folder when lib already has domains.",
      main: "Use index.ts for the main module instead of repeating its folder name.",
      owner:
        "Name this test after a source file next to __tests__, or put a package contract suite in src/__tests__.",
      publicEntry:
        "Keep private implementation in lib. A file at the source root must be a published entry point.",
    },
    schema: [],
    type: "problem",
  },
})
