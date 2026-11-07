// Loads every entry point of the built package and type-checks a consumer against its declarations
// with skipLibCheck off. Turborepo runs `build` before `build:verify`.
import { spawn } from "node:child_process"
import { resolve } from "node:path"

const projectRoot = resolve(import.meta.dirname, "..")

await run("node", "tests/package-contract/runtime.mjs")
await run("pnpm", "exec", "tsc", "--project", "tests/package-contract/tsconfig.json")

async function run(executable: string, ...arguments_: string[]): Promise<void> {
  const child = spawn(executable, arguments_, { cwd: projectRoot, stdio: "inherit" })
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject)
    child.once("exit", resolve)
  })
  if (exitCode !== 0) {
    process.exit(exitCode ?? 1)
  }
}
