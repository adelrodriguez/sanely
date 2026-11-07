import type { Deployment, DeploymentSource } from "./types"

/**
 * Create a deployment source that always resolves to the same target.
 */
export function createStaticSource(running: Deployment, target: Deployment): DeploymentSource {
  return {
    resolveTarget: () => Promise.resolve(target),
    running,
  }
}
