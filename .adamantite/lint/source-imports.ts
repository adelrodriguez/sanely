import { existsSync, statSync } from "node:fs"
import { basename, dirname, join, relative, resolve } from "node:path"
import { defineRule, type ESTree } from "adamantite/rules/plugin"

export default defineRule({
  createOnce(context) {
    function check(
      node:
        | ESTree.ImportDeclaration
        | ESTree.ExportNamedDeclaration
        | ESTree.ExportAllDeclaration
        | ESTree.ImportExpression
    ) {
      const source = node.source
      if (source?.type !== "Literal" || typeof source.value !== "string") return
      const sourceRoot = context.filename
        .replaceAll("\\", "/")
        .match(/^(.*\/packages\/[^/]+\/src)\//)?.[1]
      if (!sourceRoot) return
      const specifier = source.value
      if (!specifier.startsWith(".") && !specifier.startsWith("#")) return
      const parent = dirname(context.filename)
      const base = specifier.startsWith("#")
        ? join(sourceRoot, specifier.slice(1))
        : resolve(parent, specifier)
      const target = [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        join(base, "index.ts"),
        join(base, "index.tsx"),
      ].find((path) => existsSync(path) && statSync(path).isFile())
      if (!target || relative(sourceRoot, target).startsWith("..")) return
      if (specifier.startsWith(".") && dirname(target) === parent) return
      const path =
        dirname(target) === parent
          ? `./${basename(target)}`
          : `#${relative(sourceRoot, target).replaceAll("\\", "/")}`
      if (path === specifier) return
      context.report({
        data: { path },
        fix: (fixer) => fixer.replaceText(source, JSON.stringify(path)),
        messageId: "module",
        node: source,
      })
    }
    return {
      ExportAllDeclaration: check,
      ExportNamedDeclaration: check,
      ImportDeclaration: check,
      ImportExpression: check,
    }
  },
  meta: {
    docs: {
      description:
        "Use local imports within a folder and complete # imports across source folders.",
    },
    fixable: "code",
    messages: { module: "Import this module as {{path}}." },
    schema: [],
    type: "problem",
  },
})
