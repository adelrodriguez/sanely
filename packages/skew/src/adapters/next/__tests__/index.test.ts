import type { NextApiRequest, NextApiResponse, NextConfig } from "next"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { copyFile, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { createServer } from "node:net"
import { join } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants.js"
import { isValidElement } from "react"
import { describe, expect, it, onTestFinished } from "vitest"
import { CrispenScript, crispenPagesHandler, GET, withCrispen } from "#adapters/next/index.ts"
import { parseDescriptor } from "#lib/protocol/descriptor.ts"

function generateUserBuildId(): Promise<string> {
  return Promise.resolve("user-build")
}

async function resolveNextConfig(
  config: ReturnType<typeof withCrispen>,
  phase = PHASE_PRODUCTION_BUILD
): Promise<NextConfig> {
  return config(phase, { defaultConfig: {} })
}

/**
 * Sets environment variables for the current test and restores the previous values when the test
 * finishes.
 */
function setEnvironment(values: Readonly<Record<string, string | undefined>>): void {
  const previousEnvironment = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(values)) {
    previousEnvironment.set(key, process.env[key])
    process.env[key] = value
  }

  onTestFinished(() => {
    restoreEnvironment(previousEnvironment)
  })
}

function applyConfigEnvironment(config: NextConfig): void {
  setEnvironment(config.env ?? {})
}

function readEmbedJson(config: NextConfig): string {
  return config.env?.CRISPEN_NEXT_EMBED ?? "{}"
}

async function readHeaders(
  config: NextConfig
): Promise<Awaited<ReturnType<NonNullable<NextConfig["headers"]>>> | undefined> {
  return config.headers?.()
}

function readScriptHtml(script: ReturnType<typeof CrispenScript>): string {
  if (
    !isValidElement<{
      readonly dangerouslySetInnerHTML: { readonly __html: string }
    }>(script)
  ) {
    throw new Error("Expected CrispenScript to return a script element")
  }
  return script.props.dangerouslySetInnerHTML.__html
}

describe("next adapter", () => {
  it("adds Crispen config without replacing user config functions or values", async () => {
    expect.assertions(5)
    const config: NextConfig = {
      env: { USER_VALUE: "preserved" },
      generateBuildId: generateUserBuildId,
      headers: () =>
        Promise.resolve([
          {
            headers: [{ key: "x-user", value: "preserved" }],
            source: "/user",
          },
        ]),
      reactStrictMode: true,
    }

    const wrapped = await resolveNextConfig(withCrispen(config, { deploymentId: "A" }))
    const headers = await readHeaders(wrapped)

    expect(wrapped.deploymentId).toBeUndefined()
    expect(wrapped.generateBuildId).toBe(generateUserBuildId)
    expect(wrapped.env?.USER_VALUE).toBe("preserved")
    expect(wrapped.reactStrictMode).toBe(true)
    expect(headers).toStrictEqual([
      {
        headers: [{ key: "x-user", value: "preserved" }],
        source: "/user",
      },
      {
        headers: [{ key: "Cache-Control", value: "no-store" }],
        source: "/_crispen/deployment.json",
      },
    ])
  })

  it("bundles this package so that Next inlines the embed and descriptor", async () => {
    const packageJson: { readonly name: string } = JSON.parse(
      await readFile(join(process.cwd(), "package.json"), "utf8")
    )
    const wrapped = await resolveNextConfig(
      withCrispen({ transpilePackages: ["user-package", packageJson.name] })
    )
    const plain = await resolveNextConfig(withCrispen())

    expect(wrapped.transpilePackages).toStrictEqual(["user-package", packageJson.name])
    expect(plain.transpilePackages).toStrictEqual([packageJson.name])
  })

  it("composes with an async phase-aware user config", async () => {
    expect.assertions(5)
    const defaultConfig: NextConfig = { poweredByHeader: false }
    const userConfig = async (phase: string, context: { defaultConfig: NextConfig }) => {
      await Promise.resolve()
      expect(phase).toBe(PHASE_PRODUCTION_BUILD)
      expect(context.defaultConfig).toBe(defaultConfig)

      return {
        env: { USER_VALUE: "preserved" },
        reactStrictMode: true,
      }
    }
    const config = await withCrispen(userConfig, { deploymentId: "A" })(PHASE_PRODUCTION_BUILD, {
      defaultConfig,
    })

    expect(config.env?.USER_VALUE).toBe("preserved")
    expect(config.env?.CRISPEN_NEXT_EMBED).not.toBe("")
    expect(config.reactStrictMode).toBe(true)
  })

  it("does not override the Next deployment id used by Skew Protection", async () => {
    expect.assertions(1)
    setEnvironment({ NEXT_DEPLOYMENT_ID: "vercel-deployment" })

    const wrapped = await resolveNextConfig(withCrispen({}, { deploymentId: "crispen-deployment" }))

    expect(wrapped.deploymentId).toBeUndefined()
  })

  it("resolves a deployment id strategy through the adapter options", async () => {
    expect.assertions(1)
    setEnvironment({ COMMIT_REF: "netlify-sha" })

    const wrapped = await resolveNextConfig(
      withCrispen({}, { deploymentId: { platform: "netlify" } })
    )

    expect(wrapped.env?.CRISPEN_NEXT_EMBED).toContain('"id":"netlify-sha"')
  })

  it("prefixes the default endpoint with the Next base path", async () => {
    expect.assertions(2)
    const wrapped = await resolveNextConfig(
      withCrispen({ basePath: "/app" }, { deploymentId: "A" })
    )

    expect(JSON.parse(readEmbedJson(wrapped))).toMatchObject({
      endpoint: "/app/_crispen/deployment.json",
    })
    await expect(readHeaders(wrapped)).resolves.toContainEqual({
      basePath: false,
      headers: [{ key: "Cache-Control", value: "no-store" }],
      source: "/app/_crispen/deployment.json",
    })
  })

  it("resolves an explicit local endpoint under the Next base path", async () => {
    expect.assertions(2)
    const wrapped = await resolveNextConfig(
      withCrispen({ basePath: "/app" }, { deploymentId: "A", endpoint: "/descriptor.json" })
    )

    expect(JSON.parse(readEmbedJson(wrapped))).toMatchObject({
      endpoint: "/app/descriptor.json",
    })
    await expect(readHeaders(wrapped)).resolves.toContainEqual({
      basePath: false,
      headers: [{ key: "Cache-Control", value: "no-store" }],
      source: "/app/descriptor.json",
    })
  })

  it("does not add a base-path override for an empty base path", async () => {
    expect.assertions(1)
    const wrapped = await resolveNextConfig(withCrispen({ basePath: "" }, { deploymentId: "A" }))

    await expect(readHeaders(wrapped)).resolves.toStrictEqual([
      {
        headers: [{ key: "Cache-Control", value: "no-store" }],
        source: "/_crispen/deployment.json",
      },
    ])
  })

  it("keeps an external endpoint unchanged under a Next base path", async () => {
    expect.assertions(2)
    const wrapped = await resolveNextConfig(
      withCrispen(
        { basePath: "/app" },
        { deploymentId: "A", endpoint: "https://control.example/descriptor.json" }
      )
    )

    expect(JSON.parse(readEmbedJson(wrapped))).toMatchObject({
      endpoint: "https://control.example/descriptor.json",
    })
    await expect(readHeaders(wrapped)).resolves.toBeUndefined()
  })

  it("renders the embed and serves the matching no-store descriptor", async () => {
    expect.assertions(4)
    const config = await resolveNextConfig(withCrispen({}, { deploymentId: "A" }))
    applyConfigEnvironment(config)

    const html = readScriptHtml(CrispenScript())
    const response = GET()

    expect(html).toContain("globalThis.__CRISPEN__")
    expect(html).toContain('"id":"A"')
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    await expect(response.json()).resolves.toMatchObject({ id: "A", v: 1 })
  })

  it("serves the descriptor through the Pages Router handler", async () => {
    expect.assertions(3)
    const config = await resolveNextConfig(withCrispen({}, { deploymentId: "A" }))
    applyConfigEnvironment(config)
    const headers = new Map<string, string>()
    let body = ""
    let status = 0
    // SAFETY: crispenPagesHandler only calls setHeader, status, and end on the response.
    const response = {
      end(value: string) {
        body = value
      },
      setHeader(key: string, value: string) {
        headers.set(key, value)
      },
      status(value: number) {
        status = value
        return this
      },
    } as NextApiResponse
    // SAFETY: crispenPagesHandler does not read the request.
    const request = {} as NextApiRequest

    crispenPagesHandler(request, response)

    expect(status).toBe(200)
    expect(headers.get("Cache-Control")).toBe("no-store")
    expect(JSON.parse(body)).toMatchObject({ id: "A", v: 1 })
  })

  it("leaves the embed and descriptor inert for the Next development phase", async () => {
    expect.assertions(1)
    const config = await resolveNextConfig(
      withCrispen({}, { deploymentId: "A" }),
      PHASE_DEVELOPMENT_SERVER
    )

    expect(config.env).toMatchObject({
      CRISPEN_NEXT_DESCRIPTOR: "",
      CRISPEN_NEXT_EMBED: "",
    })
  })

  it("embeds and serves a descriptor from a real Next build", async () => {
    expect.assertions(5)

    await serveNextFixture(
      {
        "app/%5Fcrispen/deployment.json/route.ts":
          'export { GET } from "@sanely/skew/next"\nexport const dynamic = "force-static"\n',
        "app/layout.tsx":
          'import { CrispenScript } from "@sanely/skew/next"\nexport default function Layout({ children }: { children: React.ReactNode }) { return <html><body><CrispenScript />{children}</body></html> }\n',
        "app/page.tsx": "export default function Page() { return <main>Fixture</main> }\n",
        "next.config.mjs":
          'import { withCrispen } from "@sanely/skew/next"\nexport default withCrispen({ basePath: "/app" }, { deploymentId: "A" })\n',
      },
      async (origin) => {
        const [html, descriptorResponse] = await Promise.all([
          fetch(`${origin}/app/`).then((response) => response.text()),
          fetch(`${origin}/app/_crispen/deployment.json`),
        ])

        expect(html).toContain("globalThis.__CRISPEN__")
        expect(html).toContain('\\"id\\":\\"A\\"')
        expect(html).toContain("/app/_crispen/deployment.json")
        expect(descriptorResponse.headers.get("Cache-Control")).toBe("no-store")
        expect(parseDescriptor(await descriptorResponse.text()).id).toBe("A")
      }
    )
  }, 60_000)

  // The Pages Router serves an API handler only from `pages/api`, so the endpoint points there. Next
  // finds a `beforeInteractive` script in `_document` only as a direct element, so the document
  // calls `CrispenScript` instead of rendering it as a component.
  it("embeds and serves a descriptor from a real Pages Router build", async () => {
    expect.assertions(4)

    await serveNextFixture(
      {
        "next.config.mjs":
          'import { withCrispen } from "@sanely/skew/next"\nexport default withCrispen({}, { deploymentId: "A", endpoint: "/api/crispen/deployment.json" })\n',
        "pages/_document.tsx":
          'import { Head, Html, Main, NextScript } from "next/document"\nimport { CrispenScript } from "@sanely/skew/next"\nexport default function Document() { return <Html><Head /><body>{CrispenScript()}<Main /><NextScript /></body></Html> }\n',
        "pages/api/crispen/deployment.json.ts":
          'export { crispenPagesHandler as default } from "@sanely/skew/next"\n',
        "pages/index.tsx": "export default function Page() { return <main>Fixture</main> }\n",
      },
      async (origin) => {
        const [html, descriptorResponse] = await Promise.all([
          fetch(`${origin}/`).then((response) => response.text()),
          fetch(`${origin}/api/crispen/deployment.json`),
        ])

        expect(html).toContain("globalThis.__CRISPEN__")
        expect(html).toContain("/api/crispen/deployment.json")
        expect(descriptorResponse.headers.get("Cache-Control")).toBe("no-store")
        expect(parseDescriptor(await descriptorResponse.text()).id).toBe("A")
      }
    )
  }, 60_000)
})

/**
 * Builds a Next app from `files` with a fresh build of this package, starts it, and calls `check`
 * with the app's origin. The fixture links `next`, `react`, and `react-dom` from this package.
 */
async function serveNextFixture(
  files: Readonly<Record<string, string>>,
  check: (origin: string) => Promise<void>
): Promise<void> {
  const root = await mkdtemp(join(process.cwd(), ".next-adapter-test-"))
  // Build a copy of the package into the fixture. A build into the package's own `dist/` would
  // clean it while other tasks read it.
  const packageRoot = join(root, "node_modules/@sanely/skew")

  try {
    await mkdir(packageRoot, { recursive: true })
    await copyFile(join(process.cwd(), "package.json"), join(packageRoot, "package.json"))
    await run(["pnpm", "exec", "tsdown", "--out-dir", join(packageRoot, "dist")], process.cwd())
    const fixtureFiles = {
      ...files,
      "package.json": '{"name":"next-adapter-fixture","private":true,"type":"module"}',
    }
    await Promise.all(
      Object.keys(fixtureFiles).map((path) => mkdir(join(root, path, ".."), { recursive: true }))
    )
    await Promise.all([
      ...Object.entries(fixtureFiles).map(([path, content]) =>
        writeFile(join(root, path), content)
      ),
      ...["next", "react", "react-dom"].map((name) =>
        symlink(join(process.cwd(), "node_modules", name), join(root, "node_modules", name))
      ),
    ])

    await run([join(process.cwd(), "node_modules/.bin/next"), "build", "--turbopack"], root)
    const port = await findAvailablePort()
    const server = spawn(
      join(process.cwd(), "node_modules/.bin/next"),
      ["start", "--port", String(port)],
      { cwd: root, stdio: "ignore" }
    )
    const serverExit = once(server, "exit")

    try {
      await waitForServer(port)
      await check(`http://127.0.0.1:${port}`)
    } finally {
      server.kill()
      await serverExit
    }
  } finally {
    await rm(root, { force: true, recursive: true })
  }
}

function restoreEnvironment(previousEnvironment: Map<string, string | undefined>): void {
  for (const [key, value] of previousEnvironment) {
    if (value === undefined) {
      Reflect.deleteProperty(process.env, key)
    } else {
      process.env[key] = value
    }
  }
}

async function findAvailablePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    })
  })

  if (address === null || !(address instanceof Object)) {
    throw new Error("Could not allocate a test port")
  }
  return address.port
}

async function run([executable, ...arguments_]: [string, ...string[]], cwd: string): Promise<void> {
  const child = spawn(executable, arguments_, { cwd })
  let stdout = ""
  let stderr = ""
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
    stdout += chunk
  })
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
    stderr += chunk
  })
  const [exitCode] = await once(child, "close")
  if (exitCode !== 0) {
    const command = [executable, ...arguments_]
    throw new Error(`${command.join(" ")} failed\n${stdout}\n${stderr}`)
  }
}

async function waitForServer(port: number, attempts = 100): Promise<void> {
  // Any response means that the server listens. Each fixture checks its own routes.
  try {
    await fetch(`http://127.0.0.1:${port}/`)
    return
  } catch {
    // The server is still starting.
  }

  if (attempts <= 1) {
    throw new Error("Next test server did not start")
  }

  await sleep(100)
  return waitForServer(port, attempts - 1)
}
