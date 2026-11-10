// Checks that the type checker stays fast on a file with many time expression literals.
//
// The script writes a consumer file with many unit function calls on literals, so that
// `ValidateTimeExpression` checks each one. Then it runs `tsc --extendedDiagnostics` and reads the
// check time. It fails if the check time is above the limit.
//
// Usage: node scripts/typecheck-perf.ts [limit in seconds]

import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const DEFAULT_LIMIT_SECONDS = 2
const CALL_COUNT = 2000

const packageRoot = join(import.meta.dirname, "..")
const limitSeconds = Number(process.argv[2] ?? DEFAULT_LIMIT_SECONDS)

const NUMBERS = ["1", "30", "1.5", ".5", "-2", "+10", "1e3", "2.5E-1", "1234567.125"]
const UNITS = ["ms", "s", "m", "h", "d", "w", "mo", "y", "seconds", "Minutes", "HOURS", "day"]
const FUNCTIONS = ["ms", "seconds", "minutes", "hours", "days", "weeks", "months", "years"]

function pick<T>(values: readonly T[], index: number): T {
  return values[index % values.length] as T
}

function expression(index: number): string {
  const space = index % 3 === 0 ? " " : ""
  return `${pick(NUMBERS, index)}${space}${pick(UNITS, index * 7)}`
}

const lines = [
  `import { ${FUNCTIONS.join(", ")} } from ${JSON.stringify(join(packageRoot, "src/index.ts"))}`,
]
for (let index = 0; index < CALL_COUNT; index += 1) {
  lines.push(
    `export const value${index} = ${pick(FUNCTIONS, index)}(${JSON.stringify(expression(index))})`
  )
}

const temporaryDirectory = mkdtempSync(join(tmpdir(), "sanely-duration-typecheck-"))

try {
  writeFileSync(join(temporaryDirectory, "expressions.ts"), `${lines.join("\n")}\n`)
  writeFileSync(
    join(temporaryDirectory, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          allowImportingTsExtensions: true,
          module: "Preserve",
          moduleResolution: "bundler",
          noEmit: true,
          skipLibCheck: true,
          strict: true,
          target: "ESNext",
          types: [],
        },
        files: ["expressions.ts"],
      },
      null,
      2
    )}\n`
  )

  const output = execFileSync(
    process.execPath,
    [
      join(packageRoot, "node_modules/typescript/bin/tsc"),
      "--project",
      "tsconfig.json",
      "--extendedDiagnostics",
    ],
    { cwd: temporaryDirectory, encoding: "utf8" }
  )

  const checkTime = Number(/Check time:\s+([\d.]+)s/.exec(output)?.[1])
  if (!Number.isFinite(checkTime)) throw new Error(`Cannot read the check time:\n${output}`)

  console.info(
    `Type-checked ${CALL_COUNT} time expression literals in ${checkTime}s (limit ${limitSeconds}s).`
  )
  if (checkTime > limitSeconds) {
    throw new Error(`The type check time ${checkTime}s is above the limit of ${limitSeconds}s`)
  }
} finally {
  rmSync(temporaryDirectory, { force: true, recursive: true })
}
