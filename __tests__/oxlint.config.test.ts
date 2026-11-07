import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { test } from "node:test"
import { pathToFileURL } from "node:url"

void test("flags hooks and integrations keep separate dependencies", () => {
  const root = mkdtempSync(join(tmpdir(), "sanely-lint-config-"))
  const repository = resolve(import.meta.dirname, "..")
  const cases = [
    ["hooks/react.ts", 'export { useFlag } from "#integrations/react/index.tsx"', true],
    ["integrations/react/hooks.tsx", 'export { defineHook } from "#hooks/index.ts"', true],
    ["hooks/public.ts", 'export { createFlags } from "#index.ts"', true],
    ["integrations/react/public.tsx", 'export { createFlags } from "#index.ts"', true],
    ["hooks/types.ts", 'export type { Hook } from "#lib/types/index.ts"', false],
    [
      "integrations/react/registry.tsx",
      'export { getEvaluatorRecord } from "#lib/flag/registry.ts"',
      false,
    ],
  ] as const
  try {
    const config = join(root, "oxlint.config.ts")
    writeFileSync(
      config,
      `import config from ${JSON.stringify(pathToFileURL(join(repository, "oxlint.config.ts")).href)}\nexport default { ...config, options: { ...config.options, typeAware: false, typeCheck: false } }\n`
    )
    const files = cases.map(([path, source]) => {
      const filename = join(root, "packages/flags/src", path)
      mkdirSync(dirname(filename), { recursive: true })
      writeFileSync(filename, `${source}\n`)
      return filename
    })
    const result = spawnSync(
      "pnpm",
      ["exec", "oxlint", "--config", config, "--format", "json", ...files],
      {
        cwd: repository,
        encoding: "utf8",
      }
    )
    assert.ifError(result.error)
    const output: { diagnostics: Array<{ code: string; filename: string }> } = JSON.parse(
      result.stdout
    )
    const rejected = output.diagnostics
      .filter((diagnostic) => diagnostic.code === "eslint(no-restricted-imports)")
      .map((diagnostic) => diagnostic.filename)
      .toSorted((left, right) => left.localeCompare(right))
    const expected = cases
      .filter((entry) => entry[2])
      .map(([path]) => join(root, "packages/flags/src", path))
      .toSorted((left, right) => left.localeCompare(right))
    assert.deepEqual(rejected, expected, result.stdout + result.stderr)
    assert.equal(result.status, 1)
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})
