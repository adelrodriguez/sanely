import type { Plugin } from "vite"
import type { DeploymentIdOption } from "#adapters/shared.ts"
import type { DeploymentEmbed } from "#lib/protocol/embed.ts"
import type { Deployment } from "#lib/protocol/types.ts"
import {
  DEFAULT_DESCRIPTOR_ENDPOINT,
  embedScript,
  resolveDeploymentId,
  resolveOutputPath,
  resolvePublicEndpoint,
  serializeEmbed,
} from "#adapters/shared.ts"
import { serializeDescriptor } from "#lib/protocol/descriptor.ts"

export type { DeploymentIdOption, DeploymentPlatform } from "#adapters/shared.ts"

// Vite fires this event on `window` when a dynamic import or one of its preloaded files fails.
const PRELOAD_ERROR_EVENT = "vite:preloadError"

export interface ViteAdapterOptions {
  readonly deploymentId?: DeploymentIdOption
  readonly endpoint?: string
}

export function deploymentCheck(options: ViteAdapterOptions = {}): Plugin {
  const descriptorEndpoint = options.endpoint ?? DEFAULT_DESCRIPTOR_ENDPOINT
  let endpoint = descriptorEndpoint
  let deployment: Deployment | undefined

  return {
    apply: "build",
    configResolved(config) {
      endpoint = resolvePublicEndpoint(config.base, descriptorEndpoint)
      deployment = {
        builtAt: new Date(),
        id: resolveDeploymentId(options.deploymentId),
      }
    },
    generateBundle() {
      const currentDeployment = requireDeployment(deployment)
      const fileName = resolveOutputPath(descriptorEndpoint)
      if (fileName !== undefined) {
        this.emitFile({
          fileName,
          source: serializeDescriptor(currentDeployment),
          type: "asset",
        })
      }
    },
    name: "deployment-check",
    transformIndexHtml() {
      const currentDeployment = requireDeployment(deployment)
      const embed: DeploymentEmbed = {
        endpoint,
        loadErrorEvent: PRELOAD_ERROR_EVENT,
        running: {
          builtAt: currentDeployment.builtAt?.toISOString(),
          id: currentDeployment.id,
        },
        v: 1,
      }

      return [
        {
          children: embedScript(serializeEmbed(embed)),
          injectTo: "head-prepend",
          tag: "script",
        },
      ]
    },
  }
}

function requireDeployment(deployment: Deployment | undefined): Deployment {
  if (deployment === undefined) {
    throw new Error("[deployment-check] Received a Vite hook before config resolution.")
  }

  return deployment
}
