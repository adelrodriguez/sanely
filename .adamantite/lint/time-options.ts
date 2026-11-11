import type { ESTree } from "adamantite/rules/plugin"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { defineRule } from "adamantite/rules/plugin"

// A property whose name ends in one of these words holds a length of time.
const TIME_WORDS = [
  "cooldown",
  "delay",
  "duration",
  "interval",
  "period",
  "timeout",
  "ttl",
  "window",
]

// Types with these name endings hold what a caller passes in. Resolved values, such as an
// algorithm's `window`, live in other types and stay plain milliseconds.
const OPTION_TYPE = /(?:Options|Settings)$/u

const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "peerDependencies"]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

const usesDuration = new Map<string, boolean>()

// A package can accept time expressions only when it depends on duration.
function readsDuration(packageRoot: string): boolean {
  const cached = usesDuration.get(packageRoot)
  if (cached !== undefined) return cached
  const path = join(packageRoot, "package.json")
  const manifest: unknown = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined
  const result =
    isRecord(manifest)
    && DEPENDENCY_FIELDS.some((field) => {
      const dependencies = manifest[field]
      return isRecord(dependencies) && "@sanely/duration" in dependencies
    })
  usesDuration.set(packageRoot, result)
  return result
}

function namesTime(key: ESTree.Node): string | undefined {
  const name = key.type === "Identifier" ? key.name : undefined
  const lower = name?.toLowerCase()
  return lower !== undefined && TIME_WORDS.some((word) => lower.endsWith(word)) ? name : undefined
}

// The name of the type alias or interface that declares the property.
function declaringType(node: ESTree.Node): string | undefined {
  for (let current: ESTree.Node | null = node.parent; current; current = current.parent) {
    if (current.type === "TSTypeAliasDeclaration" || current.type === "TSInterfaceDeclaration") {
      return current.id.name
    }
  }
  return undefined
}

export default defineRule({
  createOnce(context) {
    let checked = false
    return {
      TSPropertySignature(node) {
        if (!checked || node.typeAnnotation?.typeAnnotation.type !== "TSNumberKeyword") return
        const name = namesTime(node.key)
        const type = declaringType(node)
        if (name === undefined || type === undefined || !OPTION_TYPE.test(type)) return
        context.report({ data: { name, type }, messageId: "bareNumber", node })
      },
      before() {
        const filename = context.filename.replaceAll("\\", "/")
        const packageRoot = /^(.*\/packages\/[^/]+)\/src\//u.exec(filename)?.[1]
        checked =
          packageRoot !== undefined
          && !filename.includes("/__tests__/")
          && readsDuration(packageRoot)
        return checked
      },
    }
  },
  meta: {
    docs: {
      description: "Let options that hold a length of time also take a time expression.",
    },
    messages: {
      bareNumber:
        'Type {{type}}.{{name}} as `number | ValidateTimeExpression<T>` from @sanely/duration, and read it with `milliseconds()`, so callers can pass a time expression such as "5m".',
    },
    schema: [],
    type: "suggestion",
  },
})
