import type { NextApiRequest, NextApiResponse, NextConfig } from "next"
import type { ReactNode } from "react"
import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js"
import Script from "next/script.js"
import { createElement } from "react"
import type { DeploymentIdOption } from "#adapters/shared.ts"
import type { DeploymentEmbed } from "#lib/protocol/embed.ts"
import type { Deployment } from "#lib/protocol/types.ts"
import {
  DEFAULT_DESCRIPTOR_ENDPOINT,
  checkIsExternalEndpoint,
  embedScript,
  removeQueryAndFragment,
  resolveDeploymentId,
  resolvePublicEndpoint,
  serializeEmbed,
} from "#adapters/shared.ts"
import { serializeDescriptor } from "#lib/protocol/descriptor.ts"

export type { DeploymentIdOption, DeploymentPlatform } from "#adapters/shared.ts"

// The Pages Router loads a package from node_modules without bundling it, so Next would not
// replace the `process.env.DEPLOYMENT_CHECK_*` reads in this package. Next bundles a transpiled package.
const PACKAGE_NAME = "@sanely/skew"

export interface NextAdapterOptions {
  readonly deploymentId?: DeploymentIdOption
  readonly endpoint?: string
}

export interface NextConfigContext {
  readonly defaultConfig: NextConfig
}

export type NextConfigFunction = (
  phase: string,
  context: NextConfigContext
) => NextConfig | Promise<NextConfig>

export type NextConfigExport = NextConfig | NextConfigFunction

export function DeploymentScript(): ReactNode {
  // Next inlines `NextConfig.env` values only for literal `process.env.KEY`
  // member accesses, so these reads must not go through a computed key.
  const embed = process.env.DEPLOYMENT_CHECK_EMBED
  if (embed === undefined || embed.length === 0) {
    return null
  }

  return createElement(Script, {
    dangerouslySetInnerHTML: {
      __html: embedScript(embed),
    },
    id: "deployment-check-embed",
    strategy: "beforeInteractive",
  })
}

export function GET(): Response {
  const descriptor = process.env.DEPLOYMENT_CHECK_DESCRIPTOR

  return new Response(descriptor ?? '{"error":"descriptor unavailable"}', {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
    status: descriptor === undefined || descriptor.length === 0 ? 404 : 200,
  })
}

export function descriptorHandler(_request: NextApiRequest, response: NextApiResponse): void {
  const descriptor = process.env.DEPLOYMENT_CHECK_DESCRIPTOR
  response.setHeader("Cache-Control", "no-store")
  response.setHeader("Content-Type", "application/json; charset=utf-8")
  response
    .status(descriptor === undefined || descriptor.length === 0 ? 404 : 200)
    .end(descriptor ?? '{"error":"descriptor unavailable"}')
}

export function withDeploymentCheck(
  config: NextConfigExport = {},
  options: NextAdapterOptions = {}
): NextConfigFunction {
  return async (phase, context) => {
    const resolvedConfig = checkIsConfigFunction(config) ? await config(phase, context) : config
    const configuredEndpoint = options.endpoint ?? DEFAULT_DESCRIPTOR_ENDPOINT
    const basePath = resolvedConfig.basePath ?? ""
    const endpoint = resolvePublicEndpoint(basePath, configuredEndpoint)
    const deployment: Deployment = {
      builtAt: new Date(),
      id: resolveDeploymentId(options.deploymentId ?? resolvedConfig.deploymentId),
    }
    const embed: DeploymentEmbed = {
      endpoint,
      running: {
        builtAt: deployment.builtAt?.toISOString(),
        id: deployment.id,
      },
      v: 1,
    }
    const descriptorHeader = createDescriptorHeader(endpoint, basePath.length > 0)
    const development = phase === PHASE_DEVELOPMENT_SERVER

    return {
      ...resolvedConfig,
      env: {
        ...resolvedConfig.env,
        DEPLOYMENT_CHECK_DESCRIPTOR: development ? "" : serializeDescriptor(deployment),
        DEPLOYMENT_CHECK_EMBED: development ? "" : serializeEmbed(embed),
      },
      headers:
        descriptorHeader === undefined
          ? resolvedConfig.headers
          : async () => [
              ...(resolvedConfig.headers === undefined ? [] : await resolvedConfig.headers()),
              descriptorHeader,
            ],
      transpilePackages: [...new Set([...(resolvedConfig.transpilePackages ?? []), PACKAGE_NAME])],
    }
  }
}

function checkIsConfigFunction(config: NextConfigExport): config is NextConfigFunction {
  return typeof config === "function"
}

function createDescriptorHeader(
  endpoint: string,
  hasBasePath: boolean
): Awaited<ReturnType<NonNullable<NextConfig["headers"]>>>[number] | undefined {
  if (checkIsExternalEndpoint(endpoint)) {
    return undefined
  }

  const headers = [{ key: "Cache-Control", value: "no-store" }]
  // Next matches `source` against the request path, and reads `?` in it as a pattern modifier.
  const source = removeQueryAndFragment(endpoint)

  if (hasBasePath) {
    return { basePath: false, headers, source }
  }

  return { headers, source }
}
