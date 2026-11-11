import { readFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { describe, expect, test } from "vitest"
import * as core from "#index.ts"
import * as react from "#integrations/react/index.tsx"
import { DEFAULT_MAX_ENTRIES, DEFAULT_TTL } from "#integrations/react/options.ts"
import * as testing from "#testing/index.ts"

// The docs repeat facts that the code and configuration own. These checks fail when one side
// changes without the other.

const packageRoot = join(import.meta.dirname, "../..")

function read(path: string): string {
  return readFileSync(join(packageRoot, path), "utf8")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

// The rows of the first Markdown table after `heading`, as arrays of trimmed cells.
function tableAfter(markdown: string, heading: string): string[][] {
  const start = markdown.indexOf(heading)
  expect(start).toBeGreaterThan(-1)
  const lines = markdown.slice(start).split("\n")
  const first = lines.findIndex((line) => line.startsWith("|"))
  const rows: string[][] = []
  for (const line of lines.slice(first + 2)) {
    if (!line.startsWith("|")) break
    rows.push(
      line
        .slice(1, -1)
        .split(/(?<!\\)\|/)
        .map((cell) => cell.trim())
    )
  }
  return rows
}

function codeNames(cell: string): string[] {
  return [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? "")
}

describe("docs/reference.md", () => {
  const reference = read("docs/reference.md")

  test("lists each entry point of package.json and the values it exports", () => {
    const manifest: unknown = JSON.parse(read("package.json"))
    const subpaths =
      isRecord(manifest) && isRecord(manifest.exports) ? Object.keys(manifest.exports) : []
    const rows = tableAfter(reference, "The package has three entry points")
    const entryPoints = subpaths.map((subpath) =>
      subpath === "." ? "@sanely/flags" : `@sanely/flags/${subpath.slice(2)}`
    )
    expect(rows.map(([entry = ""]) => codeNames(entry)[0])).toEqual(entryPoints)

    const modules: Record<string, Record<string, unknown>> = {
      "@sanely/flags": core,
      "@sanely/flags/react": react,
      "@sanely/flags/testing": testing,
    }
    for (const [entry = "", exported = ""] of rows) {
      const entryPoint = codeNames(entry)[0] ?? ""
      const values = Object.keys(modules[entryPoint] ?? {})
      const named = codeNames(exported)
      // Each value that the row names exists. `FakeProvider` is a type.
      for (const name of named.filter((value) => value !== "FakeProvider")) {
        expect(values, `${entryPoint} exports ${name}`).toContain(name)
      }
      // The core row sums up its error classes. The other rows name every value.
      if (entryPoint !== "@sanely/flags") {
        expect(named.filter((name) => values.includes(name)).toSorted()).toEqual(values.toSorted())
      }
    }
  })

  test("states the flag cache defaults that FlagsProvider uses", () => {
    const rows = tableAfter(reference, "### `FlagCacheOptions`")
    const defaults = Object.fromEntries(rows.map(([option = "", , value = ""]) => [option, value]))
    expect(defaults["`maxEntries`"]).toBe(`\`${DEFAULT_MAX_ENTRIES}\``)
    expect(defaults["`ttl`"]).toBe(`\`${DEFAULT_TTL}\``)
  })
})

describe("docs/architecture.md", () => {
  test("lists the lower domains that oxlint.config.ts allows each domain to import", async () => {
    // The root lint configuration owns the domain rules. It lives outside the package source.
    const configUrl = pathToFileURL(join(packageRoot, "../../oxlint.config.ts")).href
    const config: unknown = await import(configUrl)
    const overrides =
      isRecord(config) && isRecord(config.default) && Array.isArray(config.default.overrides)
        ? (config.default.overrides as unknown[])
        : []

    const prefix = "packages/flags/src/lib/"
    const suffix = "/**/*.{ts,tsx}"
    const allowed: Record<string, string[]> = {}
    for (const override of overrides) {
      if (!isRecord(override) || !Array.isArray(override.files)) continue
      const [files]: unknown[] = override.files
      if (typeof files !== "string" || !files.startsWith(prefix) || !files.endsWith(suffix))
        continue
      const domain = files.slice(prefix.length, -suffix.length)
      const rule = isRecord(override.rules) ? override.rules["no-restricted-imports"] : undefined
      // The rule for every lib file has no domain.
      if (!domain || domain.includes("*") || !Array.isArray(rule)) continue
      allowed[domain] = [...JSON.stringify(rule.at(1)).matchAll(/!#lib\/([a-z-]+)\/\*\*/g)]
        .map((match) => match[1] ?? "")
        .filter((lower) => lower !== domain)
    }

    const rows = tableAfter(read("docs/architecture.md"), "## Dependency order")
    const documented: Record<string, string> = Object.fromEntries(
      rows.map(([domain = "", imports = ""]) => [
        (codeNames(domain)[0] ?? "").replace("/", ""),
        imports,
      ])
    )
    expect(Object.keys(documented).toSorted()).toEqual(Object.keys(allowed).toSorted())
    for (const [domain, lower] of Object.entries(allowed)) {
      const text = documented[domain] ?? ""
      // "Every domain above" may name exceptions after "except".
      const everyAbove = text.startsWith("Every domain above")
      const names =
        text === "Nothing."
          ? []
          : everyAbove
            ? Object.keys(allowed).filter(
                (other) => other !== domain && !codeNames(text).includes(other)
              )
            : codeNames(text)
      expect(names.toSorted(), `${domain} imports`).toEqual(lower.toSorted())
    }
  })
})
