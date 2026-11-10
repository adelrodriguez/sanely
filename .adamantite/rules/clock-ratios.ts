import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { defineRule } from "adamantite/rules"

// Clock ratios and the millisecond sizes that `@sanely/core/time` defines.
const RATIOS: ReadonlyMap<number, string> = new Map([
  [24, "HOURS_PER_DAY"],
  [60, "MINUTES_PER_HOUR"],
  [1000, "MS_PER_SECOND"],
  [60_000, "MS_PER_MINUTE"],
  [3_600_000, "MS_PER_HOUR"],
  [86_400_000, "MS_PER_DAY"],
  [604_800_000, "MS_PER_WEEK"],
])

const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "peerDependencies"]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

const usesCore = new Map<string, boolean>()

// A package can import the ratios only when it depends on core. Core itself defines them.
function readsCore(packageRoot: string): boolean {
  const cached = usesCore.get(packageRoot)
  if (cached !== undefined) return cached
  const path = join(packageRoot, "package.json")
  const manifest: unknown = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined
  const result =
    isRecord(manifest)
    && manifest.name !== "@sanely/core"
    && DEPENDENCY_FIELDS.some((field) => {
      const dependencies = manifest[field]
      return isRecord(dependencies) && "@sanely/core" in dependencies
    })
  usesCore.set(packageRoot, result)
  return result
}

export default defineRule({
  createOnce(context) {
    let checked = false
    return {
      Literal(node) {
        if (!checked || typeof node.value !== "number") return
        const name = RATIOS.get(node.value)
        // A type can only spell a ratio as a literal, and a negative one, such as `-24`, has a
        // unary minus between the number and the literal type.
        const literal = node.parent.type === "UnaryExpression" ? node.parent.parent : node.parent
        if (!name || literal.type === "TSLiteralType") return
        context.report({
          data: { name, value: node.raw ?? String(node.value) },
          messageId: "literal",
          node,
        })
      },
      before() {
        const filename = context.filename.replaceAll("\\", "/")
        const packageRoot = /^(.*\/packages\/[^/]+)\/src\//.exec(filename)?.[1]
        // Tests check the ratios against literal values on purpose.
        checked =
          packageRoot !== undefined && !filename.includes("/__tests__/") && readsCore(packageRoot)
        return checked
      },
    }
  },
  meta: {
    docs: {
      description: "Read clock ratios from @sanely/core/time instead of writing them as literals.",
    },
    messages: { literal: "Use {{name}} from @sanely/core/time instead of {{value}}." },
    schema: [],
    type: "suggestion",
  },
})
