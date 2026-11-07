import { describe, expect, it, type MockInstance, onTestFinished, vi } from "vitest"
import { checkIsExternalEndpoint, resolveDeploymentId } from "#adapters/shared.ts"

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

function restoreEnvironment(previousEnvironment: Map<string, string | undefined>): void {
  for (const [key, value] of previousEnvironment) {
    if (value === undefined) {
      Reflect.deleteProperty(process.env, key)
    } else {
      process.env[key] = value
    }
  }
}

/**
 * Clears the deployment environment variables and silences warnings for the current test. Restores
 * both when the test finishes.
 */
function isolateDeploymentEnvironment(): MockInstance<typeof console.warn> {
  const previousEnvironment = new Map(
    deploymentEnvironmentVariables.map((key) => [key, process.env[key]])
  )
  for (const key of deploymentEnvironmentVariables) {
    Reflect.deleteProperty(process.env, key)
  }
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {
    /* silence expected warnings */
  })

  onTestFinished(() => {
    restoreEnvironment(previousEnvironment)
    warn.mockRestore()
  })

  return warn
}

describe("checkIsExternalEndpoint", () => {
  it.each([
    "https://control.example/deployment.json",
    "HTTP://control.example/deployment.json",
    "custom+scheme://control.example/deployment.json",
    "//control.example/deployment.json",
  ])("identifies %s as external", (endpoint) => {
    expect.assertions(1)

    expect(checkIsExternalEndpoint(endpoint)).toBe(true)
  })

  it.each([
    "/_deployment-check/deployment.json",
    "deployment.json",
    "./deployment.json",
    "../deployment.json",
    "https:/control.example/deployment.json",
  ])("identifies %s as local", (endpoint) => {
    expect.assertions(1)

    expect(checkIsExternalEndpoint(endpoint)).toBe(false)
  })
})

describe("resolveDeploymentId", () => {
  it("uses an explicit string over every strategy", () => {
    expect.assertions(1)
    isolateDeploymentEnvironment()
    process.env.VERCEL = "1"
    process.env.VERCEL_GIT_COMMIT_SHA = "vercel"

    expect(resolveDeploymentId("explicit")).toBe("explicit")
  })

  it.each([
    ["vercel", { VERCEL: "1", VERCEL_GIT_COMMIT_SHA: "vercel-sha" }, "vercel-sha"],
    ["cloudflare-pages", { CF_PAGES: "1", CF_PAGES_COMMIT_SHA: "pages-sha" }, "pages-sha"],
    ["netlify", { COMMIT_REF: "netlify-sha", NETLIFY: "true" }, "netlify-sha"],
    ["github-actions", { GITHUB_ACTIONS: "true", GITHUB_SHA: "actions-sha" }, "actions-sha"],
  ] as const)("detects %s from its marker variable", (_platform, environment, expected) => {
    expect.assertions(1)
    isolateDeploymentEnvironment()
    Object.assign(process.env, environment)

    expect(resolveDeploymentId()).toBe(expected)
  })

  it("ignores a stray CI variable when a platform marker identifies the host", () => {
    expect.assertions(1)
    isolateDeploymentEnvironment()
    process.env.GITHUB_SHA = "stray"
    process.env.VERCEL = "1"
    process.env.VERCEL_GIT_COMMIT_SHA = "vercel-sha"

    expect(resolveDeploymentId()).toBe("vercel-sha")
  })

  it("falls back to GIT_SHA when a detected platform has no commit variable", () => {
    expect.assertions(1)
    isolateDeploymentEnvironment()
    process.env.GIT_SHA = "generic"
    process.env.GITHUB_ACTIONS = "true"
    process.env.GITHUB_SHA = "other-platform"
    process.env.VERCEL = "1"

    expect(resolveDeploymentId()).toBe("generic")
  })

  it("uses GIT_SHA when no platform marker is present", () => {
    expect.assertions(1)
    isolateDeploymentEnvironment()
    process.env.GIT_SHA = "generic"
    process.env.GITHUB_SHA = "stray"

    expect(resolveDeploymentId()).toBe("generic")
  })

  it("uses a random ID without warning when nothing resolves", () => {
    expect.assertions(3)
    const warn = isolateDeploymentEnvironment()

    expect(resolveDeploymentId()).toMatch(/^[\da-f]{32}$/u)
    expect(resolveDeploymentId("")).toMatch(/^[\da-f]{32}$/u)
    expect(warn).not.toHaveBeenCalled()
  })

  it("resolves an explicit platform without its marker variable", () => {
    expect.assertions(1)
    isolateDeploymentEnvironment()
    process.env.VERCEL_GIT_COMMIT_SHA = "vercel-sha"

    expect(resolveDeploymentId({ platform: "vercel" })).toBe("vercel-sha")
  })

  it("warns and uses a random ID when an explicit platform does not resolve", () => {
    expect.assertions(2)
    const warn = isolateDeploymentEnvironment()

    expect(resolveDeploymentId({ platform: "netlify" })).toMatch(/^[\da-f]{32}$/u)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("netlify"))
  })

  it("reads a configured environment variable", () => {
    expect.assertions(1)
    isolateDeploymentEnvironment()
    process.env.CF_PAGES_COMMIT_SHA = "custom"

    expect(resolveDeploymentId({ env: "CF_PAGES_COMMIT_SHA" })).toBe("custom")
  })

  it("reads the first non-empty variable from a list", () => {
    expect.assertions(1)
    isolateDeploymentEnvironment()
    process.env.GITHUB_SHA = "second"
    process.env.GIT_SHA = ""

    expect(resolveDeploymentId({ env: ["GIT_SHA", "GITHUB_SHA"] })).toBe("second")
  })

  it("warns and uses a random ID when configured variables are empty", () => {
    expect.assertions(2)
    const warn = isolateDeploymentEnvironment()

    expect(resolveDeploymentId({ env: ["GIT_SHA", "GITHUB_SHA"] })).toMatch(/^[\da-f]{32}$/u)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("GIT_SHA, GITHUB_SHA"))
  })

  it("uses the value of a custom resolver", () => {
    expect.assertions(1)
    isolateDeploymentEnvironment()

    expect(resolveDeploymentId(() => "resolved")).toBe("resolved")
  })

  it.each([undefined, ""])(
    "warns and uses a random ID when a custom resolver returns %p",
    (value) => {
      expect.assertions(2)
      const warn = isolateDeploymentEnvironment()

      expect(resolveDeploymentId(() => value)).toMatch(/^[\da-f]{32}$/u)
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("custom resolver"))
    }
  )
})
