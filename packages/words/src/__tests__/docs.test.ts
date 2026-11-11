import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { count, lists } from "#index.ts"

const packageRoot = join(import.meta.dirname, "../..")
const documents = ["README.md", "docs/reference.md", "src/lib/names/count.ts"]

function read(path: string) {
  return readFileSync(join(packageRoot, path), "utf8")
}

// Reads the options in an example such as `count({ pattern: ["color", "animal"] })`.
function parseOptions(text: string): unknown {
  return text === "" ? {} : JSON.parse(text.replaceAll(/(\w+):/gu, '"$1":'))
}

describe("documentation", () => {
  it.each(documents)("shows the counts that count returns in %s", (path) => {
    const examples = [...read(path).matchAll(/count\((.*)\) \/\/ ([\d_]+)n/gu)]

    expect(examples.length).toBeGreaterThan(0)

    for (const [, options = "", expected = ""] of examples) {
      // The examples come from this package's own docs, so they hold valid options.
      expect(count(parseOptions(options) as Parameters<typeof count>[0]), options).toBe(
        BigInt(expected.replaceAll("_", ""))
      )
    }
  })

  it("lists the size of every category in the reference", () => {
    const rows = [...read("docs/reference.md").matchAll(/^\| `(\w+)` +\| (\d+) +\|$/gmu)]
    const documented = Object.fromEntries(
      rows.map(([, category, size]) => [category, Number(size)])
    )
    const actual = Object.fromEntries(
      Object.entries(lists).map(([category, words]) => [category, words.length])
    )

    expect(documented).toEqual(actual)
  })
})
