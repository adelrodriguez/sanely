// Replays the agreed source moves. Run one unit at a time and verify it before the next unit.
// Usage: node scripts/migrate-package-domains.ts <unit> [--write]
// The default is a dry run. --verify-first checks the first manual move against Git's source.
import { execFileSync, spawnSync } from "node:child_process"
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

function mainModules(domains: string[]): Array<[string, string]> {
  return domains.flatMap((domain) => [
    [`lib/${domain}/${domain}.ts`, `lib/${domain}/index.ts`],
    [`lib/${domain}/__tests__/${domain}.test.ts`, `lib/${domain}/__tests__/index.test.ts`],
  ])
}

const units: Record<string, { package: string; moves: Array<[string, string]>; source?: string }> =
  {
    boundaries: { moves: [], package: "cron" },
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
    docs: { moves: [], package: "errors" },
    factory: { moves: [["factory.ts", "lib/factory/index.ts"]], package: "flags" },
    "flags-tests": { moves: [], package: "flags" },
    "main-cron": {
      moves: [
        ...mainModules([
          "describe",
          "fields",
          "grammar",
          "normalize",
          "schedule",
          "serialize",
          "validate",
        ]),
        ["lib/grammar/__tests__/grammar.table.ts", "lib/grammar/__tests__/index.table.ts"],
        [
          "lib/schedule/__tests__/schedule.arbitrary.ts",
          "lib/schedule/__tests__/index.arbitrary.ts",
        ],
        ["lib/validate/__tests__/validate.table.ts", "lib/validate/__tests__/index.table.ts"],
      ],
      package: "cron",
    },
    "main-duration": { moves: mainModules(["convert", "format"]), package: "duration" },
    "main-rpc": { moves: mainModules(["client"]), package: "rpc" },
    options: { moves: [], package: "try" },
    react: {
      moves: [
        ["integrations/react.tsx", "integrations/react/index.tsx"],
        ["integrations/__tests__/react.test.tsx", "integrations/react/__tests__/index.test.tsx"],
      ],
      package: "flags",
    },
    "rpc-tests": {
      moves: [["lib/__tests__/valibot.test.ts", "__tests__/valibot.test.ts"]],
      package: "rpc",
    },
    shared: {
      moves: [
        ["lib/errors.ts", "lib/shared/errors.ts"],
        ["lib/utils.ts", "lib/shared/utils.ts"],
      ],
      package: "try",
    },
    "skew-tests": {
      moves: [
        ["lib/__tests__/scheduler.test.ts", "lib/runtime/__tests__/scheduler.test.ts"],
        ["lib/__tests__/static-source-monitor.test.ts", "__tests__/static-source-monitor.test.ts"],
        ["__tests__/helpers.ts", "lib/runtime/__tests__/helpers.ts"],
      ],
      package: "skew",
    },
    template: {
      moves: [
        ["lib/greeting/greeting.ts.hbs", "lib/greeting/index.ts.hbs"],
        ["lib/greeting/__tests__/greeting.test.ts.hbs", "lib/greeting/__tests__/index.test.ts.hbs"],
      ],
      package: "template",
      source: "turbo/generators/templates/scaffolds/new-package/src",
    },
    "try-tests": { moves: [], package: "try" },
    "verify-boundaries": { moves: [], package: "try" },
    "verify-docs": { moves: [], package: "errors" },
  }

const root = resolve(import.meta.dirname, "..")
const first = process.argv.includes("--verify-first")
const name = first ? "composition" : process.argv[2]
const unit = Object.entries(units).find(([key]) => key === name)?.[1]
if (!unit) throw new Error(`Choose a unit: ${Object.keys(units).join(", ")}`)

const sourceRoot = unit.source
  ? join(root, unit.source)
  : join(root, "packages", unit.package, "src")
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
    return entry.isDirectory() ? sourceFiles(path) : /\.tsx?(?:\.hbs)?$/.test(path) ? [path] : []
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
        `${base}.hbs`,
      ].find((path) => moves.has(path) || (existsSync(path) && statSync(path).isFile()))
      if (!target) throw new Error(`Cannot resolve ${specifier} in ${relative(root, from)}`)
      const next = moves.get(target) ?? target
      if (from === to && next === target) return match
      const path =
        dirname(next) === dirname(to)
          ? `./${relative(dirname(to), next).replace(/\.hbs$/, "")}`
          : `#${relative(sourceRoot, next).replace(/\.hbs$/, "")}`
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

if (name === "verify-docs") {
  const files = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8" }
  )
    .split("\0")
    .filter((file) => file && existsSync(join(root, file)))
  const template = "turbo/generators/templates/scaffolds/new-package/"
  const destination = (file: string) =>
    file.startsWith(template)
      ? join(root, "packages/template-check", file.slice(template.length).replace(/\.hbs$/, ""))
      : join(root, file)
  const generated = new Set(
    files.filter((file) => file.startsWith(template)).map((file) => destination(file))
  )
  for (const file of files.filter((path) => /\.md(?:\.hbs)?$/.test(path))) {
    const source = readFileSync(join(root, file), "utf8")
    for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const href = match[1]?.split("#")[0]
      if (!href || /^[a-z]+:/i.test(href) || href.includes("{{")) continue
      const target = resolve(dirname(destination(file)), href)
      if (!existsSync(target) && !generated.has(target))
        throw new Error(`Missing documentation target in ${file}: ${href}`)
    }
  }
  console.info("Verified local documentation links, including rendered template destinations.")
} else if (name === "verify-boundaries") {
  const fixtures = new Map([
    [
      join(root, "packages/try/src/lib/disposal/__boundary-check.ts"),
      'import type { RunBuilder } from "#lib/builder/index.ts"\nexport type Boundary = RunBuilder\n',
    ],
    [
      join(root, "packages/flags/src/integrations/react/__boundary-check.tsx"),
      'export { createFlags } from "../../index.ts"\n',
    ],
  ])
  for (const path of fixtures.keys())
    if (existsSync(path)) throw new Error(`The boundary fixture already exists: ${path}`)
  try {
    for (const [path, content] of fixtures) writeFileSync(path, content)
    const result = spawnSync("pnpm", ["exec", "oxlint", "--format", "unix", ...fixtures.keys()], {
      cwd: root,
      encoding: "utf8",
    })
    if (result.error) throw result.error
    const output = result.stdout + result.stderr
    if (
      result.status !== 1
      || !output.includes("no-restricted-imports")
      || !output.includes("no-relative-parent-imports")
    )
      throw new Error(`Boundary checks did not reject both fixtures:\n${output}`)
    console.info("Verified type-import boundaries and parent-import restrictions in TSX.")
  } finally {
    for (const path of fixtures.keys()) rmSync(path, { force: true })
  }
} else if (name === "docs") {
  const updates = new Map<string, string>()
  const guides: Array<[string, string]> = [
    ["errors", "Know the layout"],
    ["try", "Know the layout"],
    ["flags", "Layout"],
  ]
  for (const [name, heading] of guides) {
    const path = join(root, "packages", name, "CONTRIBUTING.md")
    const source = readFileSync(path, "utf8")
    const start = source.indexOf(`## ${heading}\n`)
    const end = source.indexOf("\n## ", start + 4)
    if (start === -1 || end === -1)
      throw new Error(`Cannot find the contributor layout for ${name}`)
    let content = `${source.slice(
      0,
      start
    )}## ${heading}\n\nRead the [architecture](docs/architecture.md) for source ownership and dependencies.\nRead the [testing guide](docs/testing.md) for test placement and package checks.\n${source.slice(
      end
    )}`
    if (name === "errors" || name === "try") {
      const start = content.indexOf("## Write tests\n")
      const end = content.indexOf("\n## ", start + 4)
      if (start === -1 || end === -1)
        throw new Error(`Cannot find the contributor test rules for ${name}`)
      content = `${content.slice(
        0,
        start
      )}## Write tests\n\nFollow the [testing guide](docs/testing.md).\n${content.slice(end)}`
    } else {
      content = content.replace(
        /- Keep the flag factory[\s\S]*?- Add or update colocated tests for behavior changes\./,
        "- Follow the [architecture](docs/architecture.md) when you change source ownership.\n- Follow the [testing guide](docs/testing.md) when you change tests."
      )
    }
    if (content !== source) updates.set(path, content)
  }
  const glossaryPath = join(root, "packages/errors/GLOSSARY.md")
  const glossary = readFileSync(glossaryPath, "utf8")
  const base = execFileSync("git", ["merge-base", "HEAD", "origin/main"], {
    cwd: root,
    encoding: "utf8",
  }).trim()
  const original = execFileSync("git", ["show", `${base}:packages/errors/GLOSSARY.md`], {
    cwd: root,
    encoding: "utf8",
  })
  const modelStart = original.indexOf("## Behavioral Model")
  const modelEnd = original.indexOf("## Public Entrypoints")
  const facts =
    modelStart !== -1 && modelEnd > modelStart
      ? original.slice(modelStart + "## Behavioral Model".length, modelEnd).trim()
      : undefined
  if (facts) {
    const path = join(root, "packages/errors/docs/architecture.md")
    const source = readFileSync(path, "utf8")
    const start = source.indexOf("## State and compatibility")
    const end = source.indexOf("See the [package structure rules]", start)
    if (start === -1 || end === -1) throw new Error("Cannot find the Fault compatibility section")
    const content = `${source.slice(0, start)}## State and compatibility\n\nFault instances own their data. \`fault.ts\` owns the original-stack \`WeakMap\`.\nRegistry closures own their constructor maps, and \`registry.ts\` owns the registry-composition \`WeakMap\`.\n\n${facts}\n\n${source.slice(end)}`
    if (content !== source) updates.set(path, content)
  }
  const end = glossary.indexOf("## Behavioral Model")
  if (end !== -1)
    updates.set(
      glossaryPath,
      `${glossary.slice(
        0,
        end
      )}See the [architecture](docs/architecture.md) for module ownership and compatibility constraints.\n`
    )
  const mapPath = join(root, "GLOSSARY-MAP.md")
  const map = readFileSync(mapPath, "utf8")
  const next = map
    .replace(" Only `@sanely/cron` has a glossary now.", "")
    .replaceAll(/^- `(@sanely\/([a-z-]+))`:/gm, (match: string, scope: string, name: string) =>
      existsSync(join(root, "packages", name, "GLOSSARY.md"))
        ? `- [\`${scope}\`](./packages/${name}/GLOSSARY.md):`
        : match
    )
  if (next !== map) updates.set(mapPath, next)
  save(updates)
} else if (name === "boundaries") {
  const path = join(sourceRoot, "__tests__/architecture.test.ts")
  const source = readFileSync(path, "utf8")
  const start = source.indexOf("const SRC")
  if (start === -1) throw new Error("Cannot find cron's source checks")
  const content = `import { existsSync, readdirSync } from "node:fs"\nimport { basename, dirname, join } from "node:path"\nimport { describe, expect, it } from "vitest"\n\n${source.slice(
    start
  )}`
  const updates = source === content ? new Map<string, string>() : new Map([[path, content]])
  const removed = [
    "flags/src/__tests__/architecture.test.ts",
    "duration/src/__tests__/architecture.test.ts",
    "rpc/src/lib/__tests__/layers.test.ts",
  ]
    .map((file) => join(root, "packages", file))
    .filter((file) => existsSync(file))
  save(updates, removed)
} else if (name === "decision" || name === "dispose-api") {
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
        `import { describe, expect, test } from "vitest"\nimport { createFlags } from "#lib/factory/index.ts"\nimport { decision } from "#lib/flag/decision.ts"\nimport { getEvaluatorRecord } from "#lib/flag/registry.ts"\n\ndescribe("createFlags", () => {\n${core.slice(start, end)}\n})\n`,
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
    const content =
      file === "index.ts"
        ? original.split("\n").find((line) => line.includes("driveGen as gen"))
        : original
    if (!content) throw new Error(`Cannot find the original manual unit in ${file}`)
    const expected = rewrite(content, from, to)
    const actual = readFileSync(to, "utf8")
    if (file === "index.ts" ? !actual.includes(expected) : expected !== actual)
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
    let after = rewrite(before, from, to)
    if (name === "rpc-tests" && to.endsWith("/__tests__/valibot.test.ts")) {
      after = after
        .replaceAll('"#lib/adapters/message-port.ts"', '"#wire/message-port.ts"')
        .replaceAll('"#lib/wire/connect.ts"', '"#wire.ts"')
        .replaceAll(
          /"#lib\/(?:client\/index|core\/(?:contract|error)|server\/(?:implement|router))\.ts"/g,
          '"#index.ts"'
        )
    }
    if (name === "skew-tests" && to.endsWith("/__tests__/static-source-monitor.test.ts")) {
      after = after.replaceAll(
        /"#lib\/(?:protocol\/static-source|runtime\/monitor)\.ts"/g,
        '"#index.ts"'
      )
    }
    if (from === to && before === after) continue
    console.info(`${write ? "Write" : "Would write"} ${relative(root, to)}`)
    changed.push(to)
    if (write) {
      mkdirSync(dirname(to), { recursive: true })
      if (from !== to) renameSync(from, to)
      writeFileSync(to, after)
    }
  }
  const format = changed.filter((path) => !path.endsWith(".hbs"))
  if (write && format.length > 0)
    execFileSync("pnpm", ["exec", "oxfmt", ...format], { cwd: root, stdio: "inherit" })
  console.info(`${changed.length} files ${write ? "changed" : "would change"}.`)
}
