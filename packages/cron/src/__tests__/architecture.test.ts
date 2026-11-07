import { existsSync, readdirSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { describe, expect, it } from "vitest"

const SRC = join(import.meta.dirname, "..")

// The suffixes of the files in a `__tests__` folder. Each file is named after the source file next
// to the folder that it tests, such as `grammar/__tests__/index.test.ts` for `grammar/index.ts`.
// A `.table.ts` file holds test data, and an `.arbitrary.ts` file holds fast-check arbitraries.
const TEST_SUFFIXES = [".test.ts", ".test-d.ts", ".table.ts", ".arbitrary.ts"]

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
