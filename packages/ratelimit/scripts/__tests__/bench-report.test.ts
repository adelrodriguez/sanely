import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { budgets } from "../bench-budgets.ts"

const script = join(import.meta.dirname, "..", "bench-report.ts")
const storeNames = ["unit", "redis-store", "valkey-store", "bun-redis-store"]

type Case = { group: string; algorithm: string; name: string; us: number }

// Every budgeted case, at half its budget.
const budgeted: Case[] = Object.entries(budgets).flatMap(([group, algorithms]) =>
  Object.entries(algorithms).flatMap(([algorithm, cases]) =>
    Object.entries(cases).map(([name, budget]) => ({ algorithm, group, name, us: budget / 2 }))
  )
)

// A `vitest bench --reporter=json` report with one round of the given cases.
function report(cases: Case[]) {
  return {
    testResults: [
      {
        assertionResults: cases.map(({ algorithm, group, name, us }) => ({
          ancestorTitles: [group],
          benchmarks: [{ tasks: [{ latency: { mean: us / 1000 }, name }] }],
          title: algorithm,
        })),
      },
    ],
  }
}

const directories: string[] = []

function run(cases: Case[]) {
  const directory = mkdtempSync(join(tmpdir(), "bench-report-"))
  directories.push(directory)

  for (const store of storeNames) {
    writeFileSync(join(directory, `${store}.1.json`), JSON.stringify(report(cases)))
  }

  return spawnSync(process.execPath, [script, directory], { encoding: "utf8" })
}

function runFile(content: unknown) {
  const directory = mkdtempSync(join(tmpdir(), "bench-report-"))
  directories.push(directory)
  writeFileSync(join(directory, "unit.1.json"), JSON.stringify(content))

  return spawnSync(process.execPath, [script, directory], { encoding: "utf8" })
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { force: true, recursive: true })
})

describe("bench-report", () => {
  it("passes when every case is within its budget", () => {
    const result = run(budgeted)

    expect(result.stdout).toContain("✅ No regressions")
    expect(result.status).toBe(0)
  })

  it("fails with the missing field when a file is not a benchmark report", () => {
    const [first] = report(budgeted).testResults
    const result = runFile({
      testResults: [{ assertionResults: first?.assertionResults.map(({ title }) => ({ title })) }],
    })

    expect(result.stderr).toContain(
      "unit.1.json is not a Vitest benchmark report: ancestorTitles is missing"
    )
    expect(result.status).toBe(1)
  })

  it("fails when a budget matches no benchmark case", () => {
    const [renamed, ...rest] = budgeted
    if (renamed === undefined) throw new Error("Expected at least one budget")

    const result = run([{ ...renamed, name: `${renamed.name} (renamed)` }, ...rest])

    expect(result.stdout).toContain("1 budgets without a benchmark")
    expect(result.stdout).toContain(renamed.name)
    expect(result.status).toBe(1)
  })
})
