import type { PlopTypes } from "@turbo/gen"
import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"
import root from "../../../package.json" with { type: "json" }

// The package name without the scope. It names the folder in `packages/` and the npm package.
const PACKAGE_NAME = /^[a-z][a-z0-9-]*$/

const repositoryHome = root.homepage.replace(/#readme$/, "")

function readAnswer(answers: PlopTypes.Answers | undefined, key: string) {
  const value: unknown = answers?.[key]

  if (typeof value !== "string") {
    throw new TypeError(`Expected text for the ${key} answer`)
  }

  return value
}

function requireText(value: string) {
  return value.trim() !== "" || "Enter a value."
}

function trim(value: string) {
  return value.trim()
}

export function registerNewPackageGenerator(plop: PlopTypes.NodePlopAPI) {
  const repositoryRoot = plop.getDestBasePath()

  // Writes a value as a JSON string, so a quote in a description stays valid in package.json.
  plop.setHelper("json", (value: string) => JSON.stringify(value))

  plop.setGenerator("new-package", {
    actions: (answers) => {
      const name = readAnswer(answers, "name")

      return [
        {
          base: "templates/scaffolds/new-package",
          data: {
            author: root.author,
            bugsUrl: root.bugs.url,
            homepage: `${repositoryHome}/tree/main/packages/${name}#readme`,
            license: root.license,
            repositoryUrl: root.repository.url,
            scope: root.name,
          },
          destination: "packages/{{name}}",
          globOptions: { dot: true },
          stripExtensions: ["hbs"],
          templateFiles: "templates/scaffolds/new-package/**",
          type: "addMany",
        },
        () => {
          execFileSync("pnpm", ["install"], { cwd: repositoryRoot, stdio: "inherit" })

          return `Installed dependencies. Add @${root.name}/${name} to the package table in README.md.`
        },
      ]
    },
    description: "Create a package in packages/ from the keel starter",
    prompts: [
      {
        message: "What is the package name, without the scope?",
        name: "name",
        type: "input",
        validate: (name: string) => {
          if (!PACKAGE_NAME.test(name)) {
            return "Use lowercase letters, digits, and dashes, and start with a letter."
          }

          if (existsSync(join(repositoryRoot, "packages", name))) {
            return `packages/${name} already exists.`
          }

          return true
        },
      },
      {
        filter: trim,
        message: "Which emoji starts the README header?",
        name: "emoji",
        type: "input",
        validate: requireText,
      },
      {
        filter: trim,
        message: "What does the package do, in one sentence?",
        name: "description",
        type: "input",
        validate: requireText,
      },
    ],
  })
}
