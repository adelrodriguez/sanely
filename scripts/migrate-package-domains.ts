// Replays the agreed source moves. Run one unit at a time and verify it before the next unit.
// Usage: node scripts/migrate-package-domains.ts <unit> [--write]
// The default is a dry run. --verify-first checks the first manual move against Git's source.
import { execFileSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { dirname, join, relative, resolve } from "node:path"

const units: Record<string, { package: string; moves: Array<[string, string]> }> = {
  builder: { moves: [["lib/builder.ts", "lib/builder/index.ts"]], package: "try" },
  composition: { moves: [["lib/gen.ts", "lib/composition/index.ts"]], package: "try" },
  decision: { moves: [["decision.ts", "lib/flag/decision.ts"]], package: "flags" },
  disposal: {
    moves: [
      ["shims/disposer.ts", "lib/disposal/index.ts"],
      ["shims/__tests__/disposer.test.ts", "lib/disposal/__tests__/index.test.ts"],
    ],
    package: "try",
  },
  "dispose-api": { moves: [["lib/dispose.ts", "lib/disposal/index.ts"]], package: "try" },
  factory: { moves: [["factory.ts", "lib/factory/index.ts"]], package: "flags" },
  "flags-tests": { moves: [], package: "flags" },
  options: { moves: [], package: "try" },
  react: {
    moves: [
      ["integrations/react.tsx", "integrations/react/index.tsx"],
      ["integrations/__tests__/react.test.tsx", "integrations/react/__tests__/index.test.tsx"],
    ],
    package: "flags",
  },
  shared: {
    moves: [
      ["lib/errors.ts", "lib/shared/errors.ts"],
      ["lib/utils.ts", "lib/shared/utils.ts"],
    ],
    package: "try",
  },
  "try-tests": { moves: [], package: "try" },
}

const root = resolve(import.meta.dirname, "..")
const first = process.argv.includes("--verify-first")
const name = first ? "composition" : process.argv[2]
const unit = Object.entries(units).find(([key]) => key === name)?.[1]
if (!unit) throw new Error(`Choose a unit: ${Object.keys(units).join(", ")}`)

const sourceRoot = join(root, "packages", unit.package, "src")
const write = process.argv.includes("--write")
const pairs = first
  ? Object.values(units)
      .filter((candidate) => candidate.package === unit.package)
      .flatMap((candidate) => candidate.moves)
      .filter(
        ([from, to]) => !existsSync(join(sourceRoot, from)) && existsSync(join(sourceRoot, to))
      )
  : unit.moves
const moves = new Map(pairs.map(([from, to]) => [join(sourceRoot, from), join(sourceRoot, to)]))

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(path) ? [path] : []
  })
}

function rewrite(source: string, from: string, to: string) {
  return source.replaceAll(
    /((?:from\s+|import\s*\(\s*)["'])([^"']+)(["'])/g,
    (match: string, start: string, specifier: string, end: string) => {
      if (!specifier.startsWith("#") && !specifier.startsWith(".")) return match
      const base = specifier.startsWith("#")
        ? join(sourceRoot, specifier.slice(1))
        : resolve(dirname(from), specifier)
      const target = [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        join(base, "index.ts"),
        join(base, "index.tsx"),
      ].find((path) => moves.has(path) || (existsSync(path) && statSync(path).isFile()))
      if (!target) throw new Error(`Cannot resolve ${specifier} in ${relative(root, from)}`)
      const next = moves.get(target) ?? target
      if (from === to && next === target) return match
      const path =
        dirname(next) === dirname(to)
          ? `./${relative(dirname(to), next)}`
          : `#${relative(sourceRoot, next)}`
      return `${start}${path}${end}`
    }
  )
}

function save(updates: Map<string, string>, removed: string[] = []) {
  for (const [path, content] of updates) {
    console.info(`${write ? "Write" : "Would write"} ${relative(root, path)}`)
    if (write) {
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, content)
    }
  }
  for (const path of removed) {
    console.info(`${write ? "Remove" : "Would remove"} ${relative(root, path)}`)
    if (write) rmSync(path)
  }
  if (write && updates.size > 0) {
    execFileSync("pnpm", ["exec", "oxfmt", ...updates.keys()], { cwd: root, stdio: "inherit" })
  }
}

if (name === "decision" || name === "dispose-api") {
  const pair = [...moves][0]
  if (!pair) throw new Error("A merge needs a source and a target")
  const [from, to] = pair
  if (existsSync(from)) {
    const updates = new Map<string, string>()
    for (const path of sourceFiles(sourceRoot)) {
      if (path === from) continue
      let content = rewrite(readFileSync(path, "utf8"), path, path)
      if (name === "dispose-api")
        content = content.replaceAll(/\bcreateAsyncDisposer\b/g, "disposer")
      if (name === "dispose-api" && path.endsWith("lib/disposal/__tests__/index.test.ts")) {
        content = content
          .replaceAll("const disposer = disposer()", "const stack = disposer()")
          .replaceAll(/\bdisposer(?=[.[])/g, "stack")
      }
      if (path === to && name === "decision") {
        const helpers = readFileSync(from, "utf8").replace(
          'import type { Decision } from "#lib/types/index.ts"\n',
          ""
        )
        content += `\n${helpers}`
      }
      if (content !== readFileSync(path, "utf8")) updates.set(path, content)
    }
    save(updates, [from])
  } else {
    if (!existsSync(to)) throw new Error(`Missing merge target: ${to}`)
    console.info("0 files would change.")
  }
} else if (name === "try-tests") {
  const path = join(sourceRoot, "lib/__tests__/coverage-exceptions.test.ts")
  if (existsSync(path)) {
    const source = readFileSync(path, "utf8")
    const retry = source.indexOf('  describe("retry helpers"')
    const utils = source.indexOf('  describe("utils"')
    const guards = source.indexOf('  describe("guard branches"')
    if (retry === -1 || utils < retry || guards < utils)
      throw new Error("Cannot find the internal test groups")
    const imports = 'import { afterEach, describe, expect, it, vi } from "vitest"\n'
    const cleanup = "afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })\n"
    const group = (start: number, end: number) => source.slice(start, end).replaceAll(/^ {2}/gm, "")
    const executionClass = source.slice(
      source.indexOf("class TestExecution"),
      source.indexOf('describe("coverage exceptions"')
    )
    save(
      new Map([
        [
          join(sourceRoot, "lib/policies/__tests__/retry.test.ts"),
          `${imports}import { calculateRetryDelay, retryOptions } from "#lib/policies/retry.ts"\n${cleanup}${group(retry, utils)}`,
        ],
        [
          join(sourceRoot, "lib/shared/__tests__/utils.test.ts"),
          `${imports}import { Panic } from "#lib/shared/errors.ts"\nimport { assertUnreachable, resolveWithAbort } from "#lib/shared/utils.ts"\n${cleanup}${group(utils, guards)}`,
        ],
        [
          join(sourceRoot, "lib/execution/__tests__/base.test.ts"),
          `import { describe, expect, it } from "vitest"\nimport type { BuilderConfig } from "#lib/policies/options.ts"\nimport { BaseExecution } from "#lib/execution/base.ts"\n${executionClass}${group(guards, source.lastIndexOf("\n})"))}`,
        ],
      ]),
      [path]
    )
  } else console.info("0 files would change.")
} else if (name === "flags-tests") {
  const corePath = join(sourceRoot, "__tests__/core.test.ts")
  const core = readFileSync(corePath, "utf8")
  const start = core.indexOf('  test("registers one record')
  if (start === -1) console.info("0 files would change.")
  else {
    const end = core.indexOf("  test.each", start)
    const enginePath = join(sourceRoot, "lib/evaluation/__tests__/engine.test.ts")
    const engine = readFileSync(enginePath, "utf8")
    const decisionStart = engine.indexOf('describe("extractDecisionValue"')
    const decisionEnd = engine.indexOf('describe("executeFlag"')
    if (end === -1 || decisionStart === -1 || decisionEnd < decisionStart)
      throw new Error("Cannot find the flag test groups")
    const updates = new Map([
      [corePath, core.slice(0, start) + core.slice(end)],
      [
        join(sourceRoot, "lib/factory/__tests__/index.test.ts"),
        `import { describe, expect, test } from "vitest"\nimport { createFlags } from "#lib/factory/index.ts"\nimport { getEvaluatorRecord } from "#lib/flag/registry.ts"\ndescribe("createFlags", () => {\n${core.slice(start, end)}\n})\n`,
      ],
      [
        join(sourceRoot, "lib/flag/__tests__/decision.test.ts"),
        `import { describe, expect, test } from "vitest"\nimport type { Decision } from "#lib/types/index.ts"\nimport { extractDecisionValue, validateDecision } from "#lib/flag/decision.ts"\nimport { MalformedDecisionError } from "#lib/shared/errors.ts"\n${engine.slice(decisionStart, decisionEnd)}`,
      ],
      [
        enginePath,
        (engine.slice(0, decisionStart) + engine.slice(decisionEnd))
          .replace(
            'import { extractDecisionValue, validateDecision } from "#lib/flag/decision.ts"\n',
            ""
          )
          .replace(", MalformedDecisionError", ""),
      ],
    ])
    for (const path of sourceFiles(join(sourceRoot, "__tests__"))) {
      let source = updates.get(path) ?? readFileSync(path, "utf8")
      source = source
        .replace('import { getEvaluatorRecord } from "#lib/flag/registry.ts"\n', "")
        .replaceAll(
          /"#lib\/(?:factory\/index|flag\/decision|shared\/errors|types\/index)\.ts"/g,
          '"#index.ts"'
        )
        .replace(", IdentityValue", "")
        .replace("Promise<IdentityValue>", "Promise<unknown>")
      if (source !== readFileSync(path, "utf8")) updates.set(path, source)
    }
    save(updates)
  }
} else if (name === "options") {
  const contextPath = join(sourceRoot, "lib/execution/context.ts")
  const optionsPath = join(sourceRoot, "lib/policies/options.ts")
  if (existsSync(contextPath)) {
    const builderPath = join(sourceRoot, "lib/builder.ts")
    const retryPath = join(sourceRoot, "lib/policies/retry.ts")
    const builder = readFileSync(builderPath, "utf8")
    const retry = readFileSync(retryPath, "utf8")
    const contracts = builder.slice(
      builder.indexOf("/**\n * Wraps"),
      builder.indexOf("type ConfigRunErrors")
    )
    const retryTypes = retry.slice(
      retry.indexOf("interface BaseRetryPolicy"),
      retry.indexOf("export function retryOptions")
    )
    if (!contracts || !retryTypes) throw new Error("Cannot find the policy declarations")
    const updates = new Map([
      [
        optionsPath,
        `${readFileSync(contextPath, "utf8")}\n${contracts.replace("type WrapFn", "export type WrapFn")}${retryTypes}`,
      ],
      [
        builderPath,
        `import type { BuilderConfig, RetryOptions, RetryPolicy, TryCtxFor, ValidateRetryLimit, ValidateRetryOptions, WrapFn } from "#lib/policies/options.ts"\n${builder
          .replace(contracts, "")
          .replace('import type { TryCtx, TryCtxFor } from "./execution/context"\n', "")
          .replace(
            /import type \{\n {2}RetryOptions,[\s\S]*?\} from "\.\/policies\/retry"\n/,
            ""
          )}`,
      ],
      [
        retryPath,
        `import type { BuilderConfig, RetryOptions, RetryPolicy, TryCtx } from "./options.ts"\n${retry.replace(retryTypes, "").replace('import type { BuilderConfig } from "#lib/builder.ts"\n', "").replace('import type { TryCtx } from "#lib/execution/context.ts"\n', "")}`,
      ],
    ])
    for (const path of sourceFiles(sourceRoot)) {
      if (path === contextPath) continue
      const before = updates.get(path) ?? readFileSync(path, "utf8")
      const after = before.replaceAll(
        /import type (\{[^}]+\}) from "(?:#lib\/builder\.ts|#lib\/execution\/context\.ts|\.\/context)"/g,
        'import type $1 from "#lib/policies/options.ts"'
      )
      if (before !== after) updates.set(path, after)
    }
    save(updates, [contextPath])
  } else {
    if (!existsSync(optionsPath)) throw new Error("Neither policy context nor options exists")
    console.info("0 files would change.")
  }
} else if (first) {
  const base = execFileSync("git", ["merge-base", "HEAD", "origin/main"], {
    cwd: root,
    encoding: "utf8",
  }).trim()
  for (const file of ["lib/gen.ts", "index.ts"]) {
    const from = join(sourceRoot, file)
    const to = moves.get(from) ?? from
    const original = execFileSync("git", ["show", `${base}:${relative(root, from)}`], {
      cwd: root,
      encoding: "utf8",
    })
    if (rewrite(original, from, to) !== readFileSync(to, "utf8"))
      throw new Error(`Manual move differs: ${file}`)
  }
  console.info("Verified the manual composition move and its public import.")
} else {
  for (const [from, to] of moves) {
    if (existsSync(from) && existsSync(to))
      throw new Error(`Both move paths exist: ${relative(root, from)}`)
    if (!existsSync(from) && !existsSync(to))
      throw new Error(`Neither move path exists: ${relative(root, from)}`)
  }
  const changed: string[] = []
  for (const from of sourceFiles(sourceRoot)) {
    const to = moves.get(from) ?? from
    const before = readFileSync(from, "utf8")
    const after = rewrite(before, from, to)
    if (from === to && before === after) continue
    console.info(`${write ? "Write" : "Would write"} ${relative(root, to)}`)
    changed.push(to)
    if (write) {
      mkdirSync(dirname(to), { recursive: true })
      if (from !== to) renameSync(from, to)
      writeFileSync(to, after)
    }
  }
  if (write && changed.length > 0)
    execFileSync("pnpm", ["exec", "oxfmt", ...changed], { cwd: root, stdio: "inherit" })
  console.info(`${changed.length} files ${write ? "changed" : "would change"}.`)
}
