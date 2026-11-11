import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { defineRule, type ESTree } from "adamantite/rules/plugin"

// A unit at the end of a camelCase name, such as the `Ms` in `timeoutMs`.
const UNIT_SUFFIX =
  /(?<=[a-z0-9])(Ms|Millis|Milliseconds|Secs|Seconds|Mins|Minutes|Hours|Days|Weeks)$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

const readsDuration = new Map<string, boolean>()

// A package that depends on duration at run time reads lengths of time as time expressions, so
// its names cannot promise a unit. Duration itself names units on purpose.
function dependsOnDuration(packageRoot: string): boolean {
  const cached = readsDuration.get(packageRoot)
  if (cached !== undefined) return cached
  const path = join(packageRoot, "package.json")
  const manifest: unknown = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined
  const result =
    isRecord(manifest)
    && isRecord(manifest.dependencies)
    && "@sanely/duration" in manifest.dependencies
  readsDuration.set(packageRoot, result)
  return result
}

type Property = ESTree.PropertyDefinition | ESTree.TSPropertySignature

function nameOf(key: Property["key"]): string | undefined {
  if (key.type === "Identifier") return key.name
  return key.type === "Literal" && typeof key.value === "string" ? key.value : undefined
}

export default defineRule({
  createOnce(context) {
    let checked = false
    const check = (node: Property) => {
      if (!checked || node.computed) return
      const name = nameOf(node.key)
      const unit = name && UNIT_SUFFIX.exec(name)?.[1]
      if (!name || !unit) return
      context.report({
        data: { name, suggestion: name.slice(0, -unit.length), unit },
        messageId: "unit",
        node: node.key,
      })
    }
    return {
      PropertyDefinition: check,
      TSPropertySignature: check,
      before() {
        const filename = context.filename.replaceAll("\\", "/")
        const packageRoot = /^(.*\/packages\/[^/]+)\/src\//.exec(filename)?.[1]
        // Tests can name fixture fields after the values they hold.
        checked =
          packageRoot !== undefined
          && !filename.includes("/__tests__/")
          && dependsOnDuration(packageRoot)
        return checked
      },
    }
  },
  meta: {
    docs: {
      description:
        "Name a length of time without its unit in a package that reads time expressions.",
    },
    messages: {
      unit: "Rename {{name}} to {{suggestion}}. A length of time here is milliseconds or a time expression, so the name cannot promise {{unit}}. See `timeout` in packages/flags/src/lib/definition/index.ts.",
    },
    schema: [],
    type: "suggestion",
  },
})
