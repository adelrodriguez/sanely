import type { DeploymentEmbed } from "#lib/protocol/embed.ts"

export { DEFAULT_DESCRIPTOR_ENDPOINT } from "#lib/protocol/http-source.ts"

export type DeploymentPlatform = "cloudflare-pages" | "github-actions" | "netlify" | "vercel"

export type DeploymentIdOption =
  | string
  | { readonly platform: DeploymentPlatform }
  | { readonly env: string | readonly string[] }
  | (() => string | undefined)

interface PlatformStrategy {
  readonly detect: (environment: NodeJS.ProcessEnv) => boolean
  readonly resolve: (environment: NodeJS.ProcessEnv) => string | undefined
}

const PLATFORM_STRATEGIES: Record<DeploymentPlatform, PlatformStrategy> = {
  "cloudflare-pages": {
    detect: (environment) => environment.CF_PAGES === "1",
    resolve: (environment) => readEnvironmentVariable(environment, "CF_PAGES_COMMIT_SHA"),
  },
  "github-actions": {
    detect: (environment) => environment.GITHUB_ACTIONS === "true",
    resolve: (environment) => readEnvironmentVariable(environment, "GITHUB_SHA"),
  },
  netlify: {
    detect: (environment) => environment.NETLIFY === "true",
    resolve: (environment) => readEnvironmentVariable(environment, "COMMIT_REF"),
  },
  vercel: {
    detect: (environment) => environment.VERCEL === "1",
    resolve: (environment) => readEnvironmentVariable(environment, "VERCEL_GIT_COMMIT_SHA"),
  },
}

const PLATFORM_DETECTION_ORDER: readonly DeploymentPlatform[] = [
  "vercel",
  "cloudflare-pages",
  "netlify",
  "github-actions",
]

export function checkIsExternalEndpoint(endpoint: string): boolean {
  return /^(?:[a-z][a-z\d+.-]*:)?\/\//iu.test(endpoint)
}

export function resolveDeploymentId(option?: DeploymentIdOption): string {
  if (checkIsDeploymentIdLiteral(option)) {
    return option !== undefined && option.length > 0 ? option : detectDeploymentId()
  }

  const resolved = resolveStrategy(option)
  if (resolved !== undefined) {
    return resolved
  }

  console.warn(
    `[deployment-check] Could not resolve a deployment ID from ${describeStrategy(option)}. This build uses a random ID.`
  )

  return randomDeploymentId()
}

function checkIsDeploymentIdLiteral(option?: DeploymentIdOption): option is string | undefined {
  return option === undefined || typeof option === "string"
}

function checkIsDeploymentIdResolver(
  option: Exclude<DeploymentIdOption, string>
): option is () => string | undefined {
  return typeof option === "function"
}

function checkIsVariableName(variables: string | readonly string[]): variables is string {
  return typeof variables === "string"
}

function describeStrategy(option: Exclude<DeploymentIdOption, string>): string {
  if (checkIsDeploymentIdResolver(option)) {
    return "the custom resolver"
  }

  if ("platform" in option) {
    return `the ${option.platform} platform`
  }

  const variables = checkIsVariableName(option.env) ? [option.env] : option.env

  return variables.length === 1
    ? `the ${variables[0]} environment variable`
    : `the ${variables.join(", ")} environment variables`
}

function detectDeploymentId(): string {
  for (const platform of PLATFORM_DETECTION_ORDER) {
    const strategy = PLATFORM_STRATEGIES[platform]
    if (strategy.detect(process.env)) {
      return (
        strategy.resolve(process.env)
        ?? readEnvironmentVariable(process.env, "GIT_SHA")
        ?? randomDeploymentId()
      )
    }
  }

  return readEnvironmentVariable(process.env, "GIT_SHA") ?? randomDeploymentId()
}

function randomDeploymentId(): string {
  return crypto.randomUUID().replaceAll("-", "")
}

function readEnvironmentVariable(environment: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = environment[name]

  return value !== undefined && value.length > 0 ? value : undefined
}

function resolveStrategy(option: Exclude<DeploymentIdOption, string>): string | undefined {
  if (checkIsDeploymentIdResolver(option)) {
    const value = option()

    return value !== undefined && value.length > 0 ? value : undefined
  }

  if ("platform" in option) {
    return PLATFORM_STRATEGIES[option.platform].resolve(process.env)
  }

  const variables = checkIsVariableName(option.env) ? [option.env] : option.env
  for (const variable of variables) {
    const value = readEnvironmentVariable(process.env, variable)
    if (value !== undefined) {
      return value
    }
  }

  return undefined
}

export function resolvePublicEndpoint(base: string, endpoint: string): string {
  if (checkIsExternalEndpoint(endpoint)) {
    return endpoint
  }

  const rootedEndpoint = `/${endpoint.replace(/^\/+/, "")}`
  if (!base.startsWith("/") || base === "/") {
    return rootedEndpoint
  }

  return `${base.replace(/\/+$/u, "")}${rootedEndpoint}`
}

export function serializeEmbed(embed: DeploymentEmbed): string {
  return JSON.stringify(embed, ["v", "running", "id", "builtAt", "endpoint"])
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029")
}
