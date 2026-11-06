// Checks that the type checker stays fast on a file with many cron phrases.
//
// The script writes a consumer file with many `cron` calls, `CronPhrase` annotations, and arrays
// of phrases. Then it runs `tsc --extendedDiagnostics` and reads the check time. It fails if the
// check time is above the limit.
//
// Usage: node scripts/typecheck-perf.ts [limit in seconds]

import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const DEFAULT_LIMIT_SECONDS = 2
const PHRASE_COUNT = 1000

const packageRoot = join(import.meta.dirname, "..")
const limitSeconds = Number(process.argv[2] ?? DEFAULT_LIMIT_SECONDS)

const DAY_SETS = [
  "weekday",
  "weekend",
  "monday",
  "monday and friday",
  "monday, wednesday and friday",
]
const ON_DAY_SETS = ["weekdays", "weekends", "sunday", "tuesday and thursday"]
const TIMES = ["9:30", "17:00", "09:05", "11:45pm", "6:00am", "noon", "midnight"]
const ORDINALS = ["1st", "2nd", "3rd", "15th", "28th"]
const MINUTES = [2, 5, 10, 15, 30]

function pick<T>(values: readonly T[], index: number): T {
  return values[index % values.length] as T
}

function phrase(index: number): string {
  const time = pick(TIMES, index)
  switch (index % 6) {
    case 0:
      return `every ${pick(MINUTES, index)} minutes between 9:00 and 17:00 on ${pick(ON_DAY_SETS, index)}`

    case 1:
      return `every ${pick(MINUTES, index)} minutes on ${pick(ON_DAY_SETS, index)}`

    case 2:
      return `every ${pick(DAY_SETS, index)} at ${time}`

    case 3:
      return `on the ${pick(ORDINALS, index)} of every month at ${time}`

    case 4:
      return `every day at ${time}`

    default:
      return pick(["hourly", "daily", "weekly", "monthly", "every 6 hours on weekends"], index)
  }
}

const lines = [
  `import { cron, type CronPhrase } from ${JSON.stringify(join(packageRoot, "src/index.ts"))}`,
]
for (let index = 0; index < PHRASE_COUNT; index += 1) {
  const text = JSON.stringify(phrase(index))
  lines.push(
    `export const cron${index} = cron(${text})`,
    `export const phrase${index}: CronPhrase = ${text}`
  )
}
lines.push(
  `export const all: CronPhrase[] = [${Array.from({ length: PHRASE_COUNT }, (_, index) => `phrase${index}`).join(", ")}]`
)

const temporaryDirectory = mkdtempSync(join(tmpdir(), "plaincron-typecheck-"))

try {
  writeFileSync(join(temporaryDirectory, "phrases.ts"), `${lines.join("\n")}\n`)
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
        files: ["phrases.ts"],
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

  console.info(`Type-checked ${PHRASE_COUNT} phrases in ${checkTime}s (limit ${limitSeconds}s).`)
  if (checkTime > limitSeconds) {
    throw new Error(`The type check time ${checkTime}s is above the limit of ${limitSeconds}s`)
  }
} finally {
  rmSync(temporaryDirectory, { force: true, recursive: true })
}
