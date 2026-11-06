import { existsSync, readdirSync, readFileSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { describe, expect, it } from "vitest"

const LIB = join(import.meta.dirname, "..", "lib")

// The lib folders in layers, from the bottom up. A folder imports only from the folders before it,
// so that all dependencies point in one direction:
//
//   phrase      the public functions: cron, parse, safeParse, guards, and errors
//   normalize   lenient form -> strict form
//   grammar     strict form  -> cron fields (and the type-level validator)
//   serialize   cron fields  -> standard cron expression
//   fields      the cron fields model
//   schedule    the public schedule types
//   vocabulary  the words and slot types of the language
//
// The grammar does not know the cron format, and the serializer does not know the language.
// `src/index.ts` re-exports the public API from `phrase` and the types. Nothing in lib imports from
// outside lib.
const LAYERS = [
  "vocabulary",
  "schedule",
  "fields",
  "serialize",
  "grammar",
  "normalize",
  "phrase",
] as const

const IMPORT_RE = /from\s+"([.#][^"]+)"/g

function getModuleFiles(folder: string): string[] {
  return readdirSync(join(LIB, folder)).filter((file) => file.endsWith(".ts"))
}

function getImports(folder: string, file: string): string[] {
  const source = readFileSync(join(LIB, folder, file), "utf8")
  return [...source.matchAll(IMPORT_RE)].map((match) => match[1] ?? "")
}

describe("module dependencies", () => {
  it("has a layer for every lib folder", () => {
    const folders = readdirSync(LIB, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)

    expect(folders.toSorted()).toEqual([...LAYERS].toSorted())
  })

  it("has no files directly in lib", () => {
    const files = readdirSync(LIB, { withFileTypes: true }).filter((entry) => entry.isFile())

    expect(files.map((entry) => entry.name)).toEqual([])
  })

  for (const [layer, folder] of LAYERS.entries()) {
    const lower = LAYERS.slice(0, layer)

    it(`${folder} imports only from ${lower.join(", ") || "itself"}`, () => {
      for (const file of getModuleFiles(folder)) {
        for (const specifier of getImports(folder, file)) {
          expect(specifier, `${folder}/${file} imports from outside lib`).not.toMatch(
            /^\.\.\/\.\.\//
          )

          if (specifier.startsWith("#") || specifier.startsWith("../")) {
            if (specifier.startsWith("#")) expect(specifier).toMatch(/^#lib\//)
            const imported = specifier.split("/")[1] ?? ""
            expect(lower, `${folder}/${file} imports ${imported}`).toContain(imported)
          }
        }
      }
    })
  }
})

describe("public entry", () => {
  it("only re-exports from lib", () => {
    const source = readFileSync(join(import.meta.dirname, "..", "index.ts"), "utf8")
    const statements = source
      .split(/\n(?=export )/)
      .map((statement) => statement.replaceAll(/\s+/g, " ").trim())
      .filter((statement) => statement !== "")

    for (const statement of statements) {
      expect(statement).toMatch(
        /^export (?:type )?(?:\*|\{[^}]*\}) from "\.\/lib\/[a-z]+\/[a-z]+"$/
      )
    }
  })
})

const SRC = join(import.meta.dirname, "..")

// The suffixes of the files in a `__tests__` folder. Each file is named after the source file next
// to the folder that it tests, such as `grammar/__tests__/grammar.test.ts` for `grammar/grammar.ts`.
const TEST_SUFFIXES = [".test.ts", ".test-d.ts", ".table.ts"]

// Tests of the whole package, not of one file. The types test is the only types test: it tests all
// public types through the package entry.
const PACKAGE_TESTS = new Set(["architecture.test.ts", "types.test-d.ts"])
const TYPES_TEST = join(SRC, "__tests__", "types.test-d.ts")

// Files with only types. The types test tests them through the package entry.
const TYPE_FILES = new Set(["types.ts"])

function findFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? findFiles(join(directory, entry.name)) : [join(directory, entry.name)]
  )
}

function getTestedName(file: string): string | undefined {
  const suffix = TEST_SUFFIXES.find((value) => file.endsWith(value))
  return suffix ? basename(file).slice(0, -suffix.length) : undefined
}

describe("test files", () => {
  const files = findFiles(SRC).filter((file) => file.endsWith(".ts"))
  const testFiles = files.filter((file) => basename(dirname(file)) === "__tests__")
  const sourceFiles = files.filter((file) => basename(dirname(file)) !== "__tests__")

  it("should have a single types test, next to index.ts", () => {
    expect(files.filter((file) => file.endsWith(".test-d.ts"))).toEqual([TYPES_TEST])
  })

  it("should put each test file in a __tests__ folder", () => {
    expect(sourceFiles.filter((file) => getTestedName(file) !== undefined)).toEqual([])
  })

  for (const file of testFiles) {
    if (PACKAGE_TESTS.has(basename(file))) continue

    it(`should name ${file.slice(SRC.length + 1)} after a sibling source file`, () => {
      const name = getTestedName(file)

      expect(name, "the file has a test suffix").toBeDefined()
      expect(existsSync(join(dirname(file), "..", `${name}.ts`))).toBe(true)
    })
  }

  for (const file of sourceFiles) {
    if (TYPE_FILES.has(basename(file))) continue

    it(`should test ${file.slice(SRC.length + 1)}`, () => {
      const name = basename(file, ".ts")
      const tests = join(dirname(file), "__tests__")
      const tested =
        existsSync(tests) && readdirSync(tests).some((test) => getTestedName(test) === name)

      expect(tested).toBe(true)
    })
  }
})
