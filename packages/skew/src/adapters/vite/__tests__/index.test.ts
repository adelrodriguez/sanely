import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { build, createServer } from "vite"
import { describe, expect, it, onTestFinished } from "vitest"
import { deploymentCheck } from "#adapters/vite/index.ts"
import { parseDescriptor } from "#lib/protocol/descriptor.ts"

const deploymentEnvironmentVariables = [
  "CF_PAGES",
  "CF_PAGES_COMMIT_SHA",
  "COMMIT_REF",
  "GIT_SHA",
  "GITHUB_ACTIONS",
  "GITHUB_SHA",
  "NETLIFY",
  "VERCEL",
  "VERCEL_GIT_COMMIT_SHA",
] as const

/**
 * Clears the deployment environment variables for the current test and restores them when the test
 * finishes.
 */
function isolateDeploymentEnvironment(): void {
  const previousEnvironment = new Map(
    deploymentEnvironmentVariables.map((key) => [key, process.env[key]])
  )
  for (const key of deploymentEnvironmentVariables) {
    Reflect.deleteProperty(process.env, key)
  }

  onTestFinished(() => {
    for (const [key, value] of previousEnvironment) {
      if (value === undefined) {
        Reflect.deleteProperty(process.env, key)
      } else {
        process.env[key] = value
      }
    }
  })
}

async function createFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "deployment-check-vite-"))
  onTestFinished(() => rm(root, { force: true, recursive: true }))
  await writeFile(
    join(root, "index.html"),
    '<!doctype html><html><head><title>Fixture</title></head><body><script type="module" src="/main.js"></script></body></html>'
  )
  await writeFile(join(root, "main.js"), 'document.body.dataset.loaded = "true"')
  return root
}

async function buildFixture(
  options: Parameters<typeof deploymentCheck>[0],
  base?: string
): Promise<{ descriptor: string; html: string; root: string }> {
  const root = await createFixture()
  await build({
    base,
    logLevel: "silent",
    plugins: [deploymentCheck(options)],
    root,
  })
  const descriptorPath =
    options?.endpoint?.replace(/^\/+/, "") ?? "_deployment-check/deployment.json"

  return {
    descriptor: await readFile(join(root, "dist", descriptorPath), "utf8"),
    html: await readFile(join(root, "dist/index.html"), "utf8"),
    root,
  }
}

describe("vite adapter", () => {
  it("embeds the running deployment and emits its descriptor", async () => {
    expect.assertions(2)
    const { descriptor, html } = await buildFixture({ deploymentId: "A" })

    expect(html).toContain('<script>globalThis.__DEPLOYMENT_CHECK__={"v":1,"running":{"id":"A"')
    expect(parseDescriptor(descriptor).id).toBe("A")
  })

  it("names Vite's preload error event in the embed", async () => {
    expect.assertions(1)
    const { html } = await buildFixture({ deploymentId: "A" })

    expect(html).toContain('"loadErrorEvent":"vite:preloadError"')
  })

  it("prefers an explicit id, then the detected platform, GIT_SHA, and a random ID", async () => {
    expect.assertions(4)
    isolateDeploymentEnvironment()
    process.env.GIT_SHA = "git"
    process.env.GITHUB_SHA = "stray"
    process.env.VERCEL = "1"
    process.env.VERCEL_GIT_COMMIT_SHA = "vercel"

    const explicit = await buildFixture({ deploymentId: "explicit" })
    expect(parseDescriptor(explicit.descriptor).id).toBe("explicit")

    const vercel = await buildFixture({})
    expect(parseDescriptor(vercel.descriptor).id).toBe("vercel")

    delete process.env.VERCEL
    delete process.env.VERCEL_GIT_COMMIT_SHA
    const git = await buildFixture({})
    expect(parseDescriptor(git.descriptor).id).toBe("git")

    delete process.env.GIT_SHA
    delete process.env.GITHUB_SHA
    const random = await buildFixture({})
    expect(parseDescriptor(random.descriptor).id).toMatch(/^[\da-f]{32}$/u)
  })

  it("resolves a deployment id strategy through the plugin options", async () => {
    expect.assertions(2)
    isolateDeploymentEnvironment()
    process.env.COMMIT_REF = "netlify-sha"

    const platform = await buildFixture({ deploymentId: { platform: "netlify" } })
    expect(parseDescriptor(platform.descriptor).id).toBe("netlify-sha")

    const resolver = await buildFixture({ deploymentId: () => "resolved" })
    expect(parseDescriptor(resolver.descriptor).id).toBe("resolved")
  })

  it("escapes the embed for an HTML script context", async () => {
    expect.assertions(2)
    const { html } = await buildFixture({
      deploymentId: "</script>\u2028\u2029",
    })

    expect(html).toContain('"id":"\\u003c/script>\\u2028\\u2029"')
    expect(html).not.toContain('"id":"</script>')
  })

  it("points to an external endpoint without emitting a local descriptor", async () => {
    expect.assertions(2)
    const root = await createFixture()
    await build({
      logLevel: "silent",
      plugins: [
        deploymentCheck({
          deploymentId: "A",
          endpoint: "https://control.example/deployment.json",
        }),
      ],
      root,
    })
    const html = await readFile(join(root, "dist/index.html"), "utf8")

    expect(html).toContain("https://control.example/deployment.json")
    await expect(access(join(root, "dist/_deployment-check/deployment.json"))).rejects.toThrow(
      "ENOENT"
    )
  })

  it("prefixes the default endpoint with the Vite base", async () => {
    expect.assertions(2)
    const { descriptor, html } = await buildFixture({ deploymentId: "A" }, "/app/")

    expect(html).toContain('"endpoint":"/app/_deployment-check/deployment.json"')
    expect(parseDescriptor(descriptor).id).toBe("A")
  })

  it("resolves an explicit local endpoint under the Vite base", async () => {
    expect.assertions(2)
    const { descriptor, html } = await buildFixture(
      { deploymentId: "A", endpoint: "/descriptor.json" },
      "/app/"
    )

    expect(html).toContain('"endpoint":"/app/descriptor.json"')
    expect(parseDescriptor(descriptor).id).toBe("A")
  })

  it("writes the descriptor without the endpoint's query string and fragment", async () => {
    expect.assertions(2)
    const root = await createFixture()
    await build({
      logLevel: "silent",
      plugins: [deploymentCheck({ deploymentId: "A", endpoint: "/descriptor.json?tenant=a#top" })],
      root,
    })
    const html = await readFile(join(root, "dist/index.html"), "utf8")

    expect(html).toContain('"endpoint":"/descriptor.json?tenant=a#top"')
    expect(parseDescriptor(await readFile(join(root, "dist/descriptor.json"), "utf8")).id).toBe("A")
  })

  it("keeps the default endpoint root-absolute for a relative Vite base", async () => {
    expect.assertions(2)
    const { descriptor, html } = await buildFixture({ deploymentId: "A" }, "./")

    expect(html).toContain('"endpoint":"/_deployment-check/deployment.json"')
    expect(parseDescriptor(descriptor).id).toBe("A")
  })

  it("keeps the default endpoint on the application origin for a URL Vite base", async () => {
    expect.assertions(2)
    const { descriptor, html } = await buildFixture(
      { deploymentId: "A" },
      "https://cdn.example/app/"
    )

    expect(html).toContain('"endpoint":"/_deployment-check/deployment.json"')
    expect(parseDescriptor(descriptor).id).toBe("A")
  })

  it("does not inject an embed during Vite development", async () => {
    expect.assertions(1)
    const root = await createFixture()
    const server = await createServer({
      logLevel: "silent",
      plugins: [deploymentCheck({ deploymentId: "A" })],
      root,
      server: { middlewareMode: true },
    })
    const source = await readFile(join(root, "index.html"), "utf8")

    const html = await server.transformIndexHtml("/", source)
    await server.close()

    expect(html).not.toContain("__DEPLOYMENT_CHECK__")
  })
})
