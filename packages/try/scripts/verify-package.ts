import { execFileSync } from "node:child_process"
import { existsSync, rmSync, writeFileSync } from "node:fs"

const outputPaths = [
  "dist/errors.d.ts",
  "dist/errors.js",
  "dist/index.d.ts",
  "dist/index.js",
  "dist/types.d.ts",
  "dist/types.js",
] as const

for (const path of outputPaths) {
  if (!existsSync(path)) {
    throw new Error(`Missing package output: ${path}`)
  }
}

const rootSpecifier = "@sanely/try"
const errorsSpecifier = "@sanely/try/errors"
const typesSpecifier = "@sanely/try/types"
const rootModule: unknown = await import(rootSpecifier)
const errorsModule: unknown = await import(errorsSpecifier)
const typesModule: unknown = await import(typesSpecifier)

assertExports(
  rootModule,
  [
    "all",
    "allSettled",
    "disposer",
    "flow",
    "gen",
    "retry",
    "retryOptions",
    "run",
    "runSync",
    "signal",
    "timeout",
    "wrap",
  ],
  "@sanely/try"
)
assertExports(
  errorsModule,
  [
    "CancellationError",
    "Panic",
    "RetryExhaustedError",
    "TimeoutError",
    "UnhandledException",
    "isCancellationError",
    "isPanic",
    "isRetryExhaustedError",
    "isTimeoutError",
    "isUnhandledException",
  ],
  "@sanely/try/errors"
)
assertExports(typesModule, [], "@sanely/try/types")

const run = rootModule.run
if (typeof run !== "function") {
  throw new Error("@sanely/try does not export run()")
}

const runResult: unknown = await Reflect.apply(run, undefined, [() => 42])
if (runResult !== 42) {
  throw new Error(`Expected run() to return 42, received ${String(runResult)}`)
}

const retryOptions = rootModule.retryOptions
if (typeof retryOptions !== "function") {
  throw new Error("@sanely/try does not export retryOptions()")
}

const policy: unknown = Reflect.apply(retryOptions, undefined, [
  { backoff: "exponential", delay: "200ms", limit: 4, maxDelay: "2s" },
])
if (!isRecord(policy) || policy.delay !== 200 || policy.maxDelay !== 2000) {
  throw new Error(`Expected retryOptions() to read time expressions, received ${String(policy)}`)
}

const consumerPath = "dist/node-next-consumer.ts"
writeFileSync(
  consumerPath,
  `import { run, timeout } from "@sanely/try"
import { TimeoutError, type UnhandledException } from "@sanely/try/errors"
import type { AsyncDisposer, FlowExit, SettledResult } from "@sanely/try/types"

const result: Promise<number | UnhandledException> = run(() => 42)
const timeoutResult: Promise<number | TimeoutError | UnhandledException> = timeout(100).run(() => 42)
const expressionResult: Promise<number | TimeoutError | UnhandledException> = timeout("5s").run(() => 42)
// @ts-expect-error -- "M" is ambiguous between minutes and months.
timeout("1M")
declare const disposer: AsyncDisposer
declare const exit: FlowExit<string>
declare const settled: SettledResult<number>

void disposer
void exit
void result
void settled
void timeoutResult
void expressionResult
`
)

try {
  execFileSync(
    process.execPath,
    [
      "node_modules/typescript/bin/tsc",
      "--ignoreConfig",
      "--noEmit",
      "--strict",
      "--skipLibCheck",
      "false",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--target",
      "ESNext",
      consumerPath,
    ],
    { stdio: "inherit" }
  )
} finally {
  rmSync(consumerPath, { force: true })
}

function assertExports(
  namespace: unknown,
  expected: readonly string[],
  entrypoint: string
): asserts namespace is Record<string, unknown> {
  if (!isRecord(namespace)) {
    throw new Error(`${entrypoint} did not load as a module namespace`)
  }

  const actual = Object.keys(namespace)
  const hasExpectedExports =
    actual.length === expected.length && expected.every((name) => Object.hasOwn(namespace, name))

  if (!hasExpectedExports) {
    throw new Error(`Unexpected ${entrypoint} exports: ${actual.join(", ")}`)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
